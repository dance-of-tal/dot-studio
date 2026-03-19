/**
 * opencode-service.ts – Shared helpers for OpenCode SDK route handlers.
 *
 * Extracted from `routes/opencode.ts` to keep route handlers thin.
 * Contains: response unwrapping, config merging, MCP mutation runner,
 * MCP auth validation, and health meta.
 */

import { getOpencode } from '../lib/opencode.js'
import { invalidate } from '../lib/cache.js'
import { OPENCODE_URL } from '../lib/config.js'
import { isManagedOpencode, canRestartOpencodeSidecar, restartOpencodeSidecar } from '../lib/opencode-sidecar.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { readProjectConfigFile, readProjectMcpCatalog, summarizeProjectMcpCatalog } from '../lib/project-config.js'
import { projectMcpEntryEnabled } from '../../shared/project-mcp.js'
import { invalidateProviderListCache } from '../lib/model-catalog.js'
import { clearStoredProviderAuth } from '../lib/opencode-auth.js'

// ── Response helpers ────────────────────────────────────

export function opencodeModeMeta() {
    return {
        managed: isManagedOpencode(),
        mode: isManagedOpencode() ? 'managed' as const : 'external' as const,
        restartAvailable: canRestartOpencodeSidecar(),
    }
}

export function responseData<T>(response: unknown, fallback: T): T {
    const data = (response as any).data
    return (data || fallback) as T
}

// ── Read-only OpenCode queries ─────────────────────────

export async function getOpenCodeHealth(directory: string) {
    const oc = await getOpencode()
    const res = await oc.project.current({ directory })
    const data = responseData(res, null)
    return {
        connected: true,
        url: OPENCODE_URL,
        project: data,
        ...opencodeModeMeta(),
    }
}

export function getOpenCodeUnavailableHealth(error: Error) {
    return {
        connected: false,
        error: error.message,
        url: OPENCODE_URL,
        ...opencodeModeMeta(),
    }
}

export async function listOpenCodeAgents(directory: string) {
    const oc = await getOpencode()
    const res = await oc.app.agents({ directory })
    return responseData(res, [])
}

export async function listOpenCodeToolIds(directory: string) {
    const oc = await getOpencode()
    const res = await oc.tool.ids({ directory })
    return responseData(res, [])
}

export async function listOpenCodeToolsForModel(directory: string, provider: string, model: string) {
    const oc = await getOpencode()
    const res = await oc.tool.list({
        directory,
        provider,
        model,
    })
    return responseData(res, [])
}

export async function getOpenCodeConfig(directory: string) {
    const oc = await getOpencode()
    const res = await oc.config.get({ directory })
    return responseData(res, {})
}

export async function getProviderAuthStatus(directory: string) {
    const oc = await getOpencode()
    return unwrapOpencodeResult<any>(await oc.provider.auth({ directory })) || {}
}

export async function getLspStatus(directory: string) {
    const oc = await getOpencode()
    const res = await oc.lsp.status({ directory })
    return responseData(res, [])
}

export async function listFiles(directory: string, targetPath: string) {
    const oc = await getOpencode()
    const res = await oc.file.list({ directory, path: targetPath })
    return responseData(res, [])
}

export async function readFile(directory: string, targetPath: string) {
    const oc = await getOpencode()
    const res = await oc.file.read({ directory, path: targetPath })
    return responseData(res, {})
}

export async function getFileStatus(directory: string) {
    const oc = await getOpencode()
    const res = await oc.file.status({ directory })
    return responseData(res, [])
}

export async function findTextInProject(directory: string, pattern: string) {
    const oc = await getOpencode()
    const res = await oc.find.text({ directory, pattern })
    return responseData(res, [])
}

export async function findFilesInProject(directory: string, pattern: string) {
    const oc = await getOpencode()
    const res = await oc.find.files({ directory, query: pattern })
    return responseData(res, [])
}

export async function findSymbolsInProject(directory: string, pattern: string) {
    const oc = await getOpencode()
    const res = await oc.find.symbols({ directory, query: pattern })
    return responseData(res, [])
}

export async function getVcsStatus(directory: string) {
    const oc = await getOpencode()
    const res = await oc.vcs.get({ directory })
    return responseData(res, {})
}

// ── Mutations ──────────────────────────────────────────

export async function restartManagedOpenCode() {
    await restartOpencodeSidecar()
    return {
        ok: true as const,
        managed: isManagedOpencode(),
        mode: isManagedOpencode() ? 'managed' as const : 'external' as const,
    }
}

export async function updateOpenCodeConfig(directory: string, patch: unknown) {
    const oc = await getOpencode()
    const current = await readProjectConfigFile(directory)
    const nextConfig = mergeProjectConfig(current, patch && typeof patch === 'object' ? patch as Record<string, unknown> : {})
    const res = await oc.config.update({ directory, config: nextConfig })
    invalidate('mcp-servers')
    return responseData(res, {})
}

export async function authorizeProviderOauth(directory: string, providerId: string, method: number) {
    const oc = await getOpencode()
    return unwrapOpencodeResult<any>(await oc.provider.oauth.authorize({
        providerID: providerId,
        directory,
        method,
    }))
}

export async function completeProviderOauth(directory: string, providerId: string, method: number, code?: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.provider.oauth.callback({
        providerID: providerId,
        directory,
        method,
        ...(code ? { code } : {}),
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return data
}

export async function updateProviderAuth(providerId: string, auth: unknown) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.auth.set({
        providerID: providerId,
        auth: auth as any,
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return data
}

export async function deleteProviderAuth(providerId: string) {
    const oc = await getOpencode()
    await clearStoredProviderAuth(providerId)
    await oc.global.dispose()
    invalidateProviderListCache()
    return { ok: true as const }
}

export async function listMcpServers(directory: string) {
    return cachedMcpServers(directory)
}

async function cachedMcpServers(cwd: string) {
    const oc = await getOpencode()
    const res = await oc.mcp.status({ directory: cwd })
    const data = ((res as any).data || {}) as Record<string, any>
    const catalog = await readProjectMcpCatalog(cwd)
    return summarizeProjectMcpCatalog(catalog, data)
}

export async function startMcpAuth(directory: string, name: string) {
    await validateMcpAuthRequest(directory, name)
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.mcp.auth.start({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

export async function completeMcpAuth(directory: string, name: string, code: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.mcp.auth.callback({
        name,
        directory,
        code,
    }))
    invalidate('mcp-servers')
    return data
}

export async function authenticateMcp(directory: string, name: string) {
    await validateMcpAuthRequest(directory, name)
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.mcp.auth.authenticate({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

export async function removeMcpAuth(directory: string, name: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<any>(await oc.mcp.auth.remove({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

// ── Config ──────────────────────────────────────────────

export async function readProjectConfigFromOpencode(directory: string) {
    const oc = await getOpencode()
    const res = await oc.file.read({
        directory,
        path: 'config.json',
    })
    const data = responseData<any>(res, {})
    const raw = typeof data?.content === 'string' ? data.content : '{}'
    return {
        cwd: directory,
        config: JSON.parse(raw),
    }
}

export async function readProjectConfigSnapshot(directory: string) {
    try {
        const { cwd, config } = await readProjectConfigFromOpencode(directory)
        return {
            exists: true as const,
            path: `${cwd}/config.json`,
            config,
        }
    } catch {
        return {
            exists: false as const,
            path: `${directory}/config.json`,
            config: {},
        }
    }
}

export function mergeProjectConfig(
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...current,
        ...patch,
        ...(patch.mcp && typeof patch.mcp === 'object' ? { mcp: patch.mcp } : {}),
    }
}

// ── MCP ─────────────────────────────────────────────────

export async function runMcpMutation(
    _directory: string,
    action: (oc: Awaited<ReturnType<typeof getOpencode>>) => Promise<unknown>,
) {
    const oc = await getOpencode()
    const result = await action(oc)
    invalidate('mcp-servers')
    return responseData(result, {})
}

export async function addMcpServer(
    directory: string,
    input: { name: string; config: { command: string; args?: string[]; env?: Record<string, string> } | { url: string } },
) {
    return runMcpMutation(directory, (oc) => oc.mcp.add({
        directory,
        name: input.name,
        config: input.config as any,
    }))
}

export async function connectMcpServer(directory: string, name: string) {
    return runMcpMutation(directory, (oc) => oc.mcp.connect({
        name,
        directory,
    }))
}

export async function disconnectMcpServer(directory: string, name: string) {
    return runMcpMutation(directory, (oc) => oc.mcp.disconnect({
        name,
        directory,
    }))
}

export async function validateMcpAuthRequest(directory: string, name: string) {
    const catalog = await readProjectMcpCatalog(directory)
    const config = catalog[name]

    if (!config) {
        throw new StudioValidationError(`MCP server '${name}' is not defined in this project.`, 'fix_input', 404)
    }

    if (!projectMcpEntryEnabled(config)) {
        throw new StudioValidationError(`MCP server '${name}' is disabled in this project.`, 'fix_input', 400)
    }

    if (!('type' in config) || config.type !== 'remote') {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }

    if (config.oauth === false) {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }
}
