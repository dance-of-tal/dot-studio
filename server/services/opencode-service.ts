/**
 * opencode-service.ts – Shared helpers for OpenCode SDK route handlers.
 *
 * Extracted from `routes/opencode.ts` to keep route handlers thin.
 * Contains: response unwrapping, config merging, MCP mutation runner,
 * MCP auth validation, and health meta.
 */

import { getOpencode } from '../lib/opencode.js'
import { invalidate } from '../lib/cache.js'
import { requestDirectoryQuery, resolveRequestWorkingDir } from '../lib/request-context.js'
import { isManagedOpencode, canRestartOpencodeSidecar } from '../lib/opencode-sidecar.js'
import { StudioValidationError } from '../lib/opencode-errors.js'
import { readProjectMcpCatalog } from '../lib/project-config.js'
import { projectMcpEntryEnabled } from '../../shared/project-mcp.js'

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

// ── Config ──────────────────────────────────────────────

export async function readProjectConfigFromOpencode(c: Parameters<typeof requestDirectoryQuery>[0]) {
    const oc = await getOpencode()
    const cwd = resolveRequestWorkingDir(c)
    const res = await oc.file.read({
        directory: cwd,
        path: 'config.json',
    })
    const data = responseData<any>(res, {})
    const raw = typeof data?.content === 'string' ? data.content : '{}'
    return {
        cwd,
        config: JSON.parse(raw),
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
    c: Parameters<typeof requestDirectoryQuery>[0],
    action: (oc: Awaited<ReturnType<typeof getOpencode>>) => Promise<unknown>,
) {
    const oc = await getOpencode()
    const result = await action(oc)
    invalidate('mcp-servers')
    return c.json(responseData(result, {}))
}

export async function validateMcpAuthRequest(c: Parameters<typeof requestDirectoryQuery>[0], name: string) {
    const catalog = await readProjectMcpCatalog(resolveRequestWorkingDir(c))
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
