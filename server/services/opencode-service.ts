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
import {
    readProjectConfigFile,
    resolveProjectConfigPath,
    writeProjectConfigFile,
} from '../lib/project-config.js'
import { mergeOpenCodeConfig, readGlobalConfigFile, writeGlobalConfigFile } from '../lib/global-config.js'
import { readGlobalMcpCatalog, readProjectMcpServerNames, summarizeMcpCatalog } from '../lib/mcp-catalog.js'
import type { McpLiveStatusMap } from '../lib/mcp-catalog.js'
import { invalidateProviderListCache } from '../lib/model-catalog.js'
import {
    buildStoredProviderConnections,
    clearStoredProviderAuth,
    listStoredProviderAuthTypes,
} from '../lib/opencode-auth.js'
import {
    extractMcpCatalog,
    isMcpCatalog,
    mergeMcpToolOverrides,
    type McpCatalog,
} from '../../shared/mcp-catalog.js'

type ResponseEnvelope<T> = { data?: T | null | undefined }
type ProviderAuthStatus = Record<string, unknown>
type OauthResponse = Record<string, unknown>
type McpAuthResponse = Record<string, unknown>
type ProviderAuthInput =
    | { type: 'oauth'; refresh: string; access: string; expires: number; enterpriseUrl?: string; accountId?: string }
    | { type: 'api'; key: string }
    | { type: 'wellknown'; key: string; token: string }

function extractResponseData<T>(response: unknown): T | undefined {
    if (!response || typeof response !== 'object' || !('data' in response)) {
        return undefined
    }
    return (response as ResponseEnvelope<T>).data ?? undefined
}

// ── Response helpers ────────────────────────────────────

export function opencodeModeMeta() {
    return {
        managed: isManagedOpencode(),
        mode: isManagedOpencode() ? 'managed' as const : 'external' as const,
        restartAvailable: canRestartOpencodeSidecar(),
    }
}

export function responseData<T>(response: unknown, fallback: T): T {
    const data = extractResponseData<T>(response)
    return (data || fallback) as T
}

function isProviderAuthInput(value: unknown): value is ProviderAuthInput {
    if (!value || typeof value !== 'object') return false
    const auth = value as Record<string, unknown>
    if (auth.type === 'oauth') {
        return typeof auth.refresh === 'string' && typeof auth.access === 'string' && typeof auth.expires === 'number'
    }
    if (auth.type === 'api') {
        return typeof auth.key === 'string'
    }
    if (auth.type === 'wellknown') {
        return typeof auth.key === 'string' && typeof auth.token === 'string'
    }
    return false
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

export async function getGlobalOpenCodeConfig() {
    return readGlobalConfigFile()
}

export async function getStudioMcpCatalog() {
    return readGlobalMcpCatalog()
}

export async function getProviderAuthMethods(directory: string) {
    const oc = await getOpencode()
    return unwrapOpencodeResult<ProviderAuthStatus>(await oc.provider.auth({ directory })) || {}
}

export async function getProviderConnections() {
    return buildStoredProviderConnections(await listStoredProviderAuthTypes())
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

export async function updateGlobalOpenCodeConfig(patch: unknown) {
    const current = await readGlobalConfigFile()
    const nextConfig = mergeOpenCodeConfig(current, patch && typeof patch === 'object' ? patch as Record<string, unknown> : {})
    await writeGlobalConfigFile(nextConfig)
    invalidate('mcp-servers')
    return nextConfig
}

export async function updateStudioMcpCatalog(catalog: unknown): Promise<McpCatalog> {
    if (!isMcpCatalog(catalog)) {
        throw new StudioValidationError('Invalid MCP catalog payload.')
    }

    const current = await readGlobalConfigFile()
    const previousCatalog = extractMcpCatalog(current)
    const nextTools = mergeMcpToolOverrides(
        current.tools && typeof current.tools === 'object'
            ? current.tools as Record<string, unknown>
            : {},
        previousCatalog,
        catalog,
    )
    const nextConfig = mergeOpenCodeConfig(current, {
        mcp: catalog,
        tools: nextTools,
    })

    await writeGlobalConfigFile(nextConfig, { dispose: false })
    invalidate('mcp-servers')
    return catalog
}

export async function updateProjectOpenCodeConfig(directory: string, patch: unknown) {
    const current = await readProjectConfigFile(directory)
    const nextConfig = mergeProjectConfig(current, patch && typeof patch === 'object' ? patch as Record<string, unknown> : {})
    await writeProjectConfigFile(directory, nextConfig)
    invalidate('mcp-servers')
    return nextConfig
}

export async function authorizeProviderOauth(directory: string, providerId: string, method: number) {
    const oc = await getOpencode()
    return unwrapOpencodeResult<OauthResponse>(await oc.provider.oauth.authorize({
        providerID: providerId,
        directory,
        method,
    }))
}

export async function completeProviderOauth(directory: string, providerId: string, method: number, code?: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<OauthResponse>(await oc.provider.oauth.callback({
        providerID: providerId,
        directory,
        method,
        ...(code ? { code } : {}),
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return data
}

export async function updateProviderAuth(_directory: string, providerId: string, auth: unknown) {
    if (!isProviderAuthInput(auth)) {
        throw new StudioValidationError('Invalid provider auth payload.')
    }
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<ProviderAuthStatus>(await oc.auth.set({
        providerID: providerId,
        auth,
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return data
}

export async function deleteProviderAuth(_directory: string, providerId: string) {
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
    const data = responseData<McpLiveStatusMap>(res, {})
    const catalog = await readGlobalMcpCatalog()
    const shadowedServerNames = await readProjectMcpServerNames(cwd)
    return summarizeMcpCatalog(catalog, data, shadowedServerNames)
}

export async function startMcpAuth(directory: string, name: string) {
    await validateMcpAuthRequest(directory, name)
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<McpAuthResponse>(await oc.mcp.auth.start({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

export async function completeMcpAuth(directory: string, name: string, code: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<McpAuthResponse>(await oc.mcp.auth.callback({
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
    const data = unwrapOpencodeResult<McpAuthResponse>(await oc.mcp.auth.authenticate({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

export async function removeMcpAuth(directory: string, name: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<McpAuthResponse>(await oc.mcp.auth.remove({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return data
}

// ── Config ──────────────────────────────────────────────

export async function readProjectConfigFromOpencode(directory: string) {
    return {
        cwd: directory,
        config: await readProjectConfigFile(directory),
    }
}

export async function readProjectConfigSnapshot(directory: string) {
    try {
        const { cwd, config } = await readProjectConfigFromOpencode(directory)
        const configPath = await resolveProjectConfigPath(cwd)
        return {
            exists: true as const,
            path: configPath,
            config,
        }
    } catch {
        const configPath = await resolveProjectConfigPath(directory)
        return {
            exists: false as const,
            path: configPath,
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

export async function connectMcpServer(directory: string, name: string) {
    await validateStudioManagedMcpServer(directory, name)
    return runMcpMutation(directory, (oc) => oc.mcp.connect({
        name,
        directory,
    }))
}

export async function validateMcpAuthRequest(directory: string, name: string) {
    await validateStudioManagedMcpServer(directory, name)
    const catalog = await readGlobalMcpCatalog()
    const config = catalog[name]

    if (!config) {
        throw new StudioValidationError(`MCP server '${name}' is not defined in the Studio MCP library.`, 'fix_input', 404)
    }

    if (!('type' in config) || config.type !== 'remote') {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }

    if (config.oauth === false) {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }
}

async function validateStudioManagedMcpServer(directory: string, name: string) {
    const projectMcpNames = new Set(await readProjectMcpServerNames(directory))
    if (projectMcpNames.has(name)) {
        throw new StudioValidationError(
            `MCP server '${name}' is shadowed by this workspace's project config. Studio only manages global MCP servers.`,
            'fix_input',
            409,
        )
    }
}
