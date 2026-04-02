import { getOpencode } from './opencode.js'
import type { ModelSelection } from '../../shared/model-types.js'
import {
    mcpToolPattern,
    type McpCatalog,
} from '../../shared/mcp-catalog.js'
import { readGlobalMcpCatalog, readProjectMcpServerNames } from './mcp-catalog.js'
import type { McpLiveStatusMap } from './mcp-catalog.js'
import { unwrapOpencodeResult } from './opencode-errors.js'

export type RuntimeToolResolution = {
    selectedMcpServers: string[]
    requestedTools: string[]
    availableTools: string[]
    resolvedTools: string[]
    unavailableTools: string[]
    unavailableDetails: Array<{
        serverName: string
        reason: 'not_defined' | 'shadowed_by_project' | 'needs_auth' | 'needs_client_registration' | 'connect_failed'
        toolId?: string
        detail?: string
    }>
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback
}

export function describeUnavailableRuntimeTools(
    resolution: RuntimeToolResolution,
): string | null {
    if (resolution.selectedMcpServers.length === 0 || resolution.unavailableDetails.length === 0) {
        return null
    }

    const parts = resolution.unavailableDetails.map((detail) => {
        if (detail.reason === 'needs_auth') {
            return `${detail.serverName}: authentication required`
        }
        if (detail.reason === 'needs_client_registration') {
            return `${detail.serverName}: OAuth client registration required`
        }
        if (detail.reason === 'not_defined') {
            return `${detail.serverName}: not defined in the Studio MCP library`
        }
        if (detail.reason === 'shadowed_by_project') {
            return `${detail.serverName}: shadowed by a project MCP definition in this workspace`
        }
        return `${detail.serverName}: connection failed`
    })

    return parts.join('; ')
}

export function buildEnabledToolMap(toolIds: Iterable<string>): Record<string, boolean> | undefined {
    const enabled = unique(Array.from(toolIds))
    if (enabled.length === 0) {
        return undefined
    }

    return enabled.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true
        return acc
    }, {})
}

function emptyResolution(selectedMcpServers: string[]): RuntimeToolResolution {
    return {
        selectedMcpServers,
        requestedTools: [],
        availableTools: [],
        resolvedTools: [],
        unavailableTools: [],
        unavailableDetails: [],
    }
}

async function currentMcpStatus(oc: Awaited<ReturnType<typeof getOpencode>>, cwd: string) {
    return unwrapOpencodeResult<McpLiveStatusMap>(await oc.mcp.status({ directory: cwd })) || {}
}

async function ensureConnectedServer(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    cwd: string,
    serverName: string,
    catalog: McpCatalog,
    statusMap: McpLiveStatusMap,
    shadowedServerNames: Set<string>,
) {
    const config = catalog[serverName]
    if (!config) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'not_defined' as const,
                detail: 'Server is not defined in the Studio MCP library.',
            },
        }
    }

    if (shadowedServerNames.has(serverName)) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'shadowed_by_project' as const,
                detail: 'This workspace defines a project MCP with the same name. Studio ignores project-level MCP definitions.',
            },
        }
    }

    const current = statusMap[serverName]
    if (current?.status === 'connected') {
        return {
            statusMap,
            unavailable: null,
        }
    }

    if (current?.status === 'needs_auth') {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'needs_auth' as const,
                detail: 'Server requires authentication before it can connect.',
            },
        }
    }

    if (current?.status === 'needs_client_registration') {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'needs_client_registration' as const,
                detail: current?.error || 'Server requires OAuth client registration before it can connect.',
            },
        }
    }

    try {
        await oc.mcp.connect({
            name: serverName,
            directory: cwd,
        })
    } catch (error: unknown) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'connect_failed' as const,
                detail: errorMessage(error, 'Connection attempt failed.'),
            },
        }
    }

    const refreshed = await currentMcpStatus(oc, cwd)
    const next = refreshed[serverName]
    if (next?.status === 'connected') {
        return {
            statusMap: refreshed,
            unavailable: null,
        }
    }

    if (next?.status === 'needs_auth') {
        return {
            statusMap: refreshed,
            unavailable: {
                serverName,
                reason: 'needs_auth' as const,
                detail: 'Server requires authentication before it can connect.',
            },
        }
    }

    if (next?.status === 'needs_client_registration') {
        return {
            statusMap: refreshed,
            unavailable: {
                serverName,
                reason: 'needs_client_registration' as const,
                detail: next?.error || 'Server requires OAuth client registration before it can connect.',
            },
        }
    }

    if (!next?.status || next.status === 'disconnected' || next.status === 'unknown') {
        // OpenCode can return an empty MCP status map even after a successful
        // connect() call for globally configured servers. In that case, trust
        // the successful mutation and allow projection to proceed.
        return {
            statusMap: refreshed,
            unavailable: null,
        }
    }

    return {
        statusMap: refreshed,
        unavailable: {
            serverName,
            reason: 'connect_failed' as const,
            detail: next?.error || 'Server did not reach connected state.',
        },
    }
}

export async function resolveRuntimeTools(
    cwd: string,
    _model: ModelSelection,
    mcpServerNames: string[],
): Promise<RuntimeToolResolution> {
    const selectedMcpServers = unique(mcpServerNames)
    if (selectedMcpServers.length === 0) {
        return emptyResolution(selectedMcpServers)
    }

    const oc = await getOpencode()
    const catalog = await readGlobalMcpCatalog()
    const shadowedServerNames = new Set(await readProjectMcpServerNames(cwd))
    let mcpStatus = await currentMcpStatus(oc, cwd)
    const unavailableDetails: RuntimeToolResolution['unavailableDetails'] = []

    for (const serverName of selectedMcpServers) {
        const ensured = await ensureConnectedServer(oc, cwd, serverName, catalog, mcpStatus, shadowedServerNames)
        mcpStatus = ensured.statusMap
        if (ensured.unavailable) {
            unavailableDetails.push(ensured.unavailable)
        }
    }

    const unavailableServerNames = new Set(unavailableDetails.map((detail) => detail.serverName))
    const requestedTools = selectedMcpServers.map(mcpToolPattern)
    const resolvedServers = selectedMcpServers.filter((serverName) => !unavailableServerNames.has(serverName))
    const resolvedTools = resolvedServers.map(mcpToolPattern)
    const unavailableTools = unavailableDetails.map((detail) => mcpToolPattern(detail.serverName))

    return {
        selectedMcpServers,
        requestedTools,
        availableTools: resolvedTools,
        resolvedTools,
        unavailableTools,
        unavailableDetails,
    }
}
