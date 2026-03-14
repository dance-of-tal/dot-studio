import { getOpencode } from './opencode.js'

type ModelSelection = { provider: string; modelId: string } | null
import { projectMcpEntryEnabled, type ProjectMcpCatalog } from '../../shared/project-mcp.js'
import { readProjectMcpCatalog } from './project-config.js'

export type RuntimeToolResolution = {
    selectedMcpServers: string[]
    requestedTools: string[]
    availableTools: string[]
    resolvedTools: string[]
    unavailableTools: string[]
    unavailableDetails: Array<{
        serverName: string
        reason: 'not_defined' | 'disabled' | 'needs_auth' | 'needs_client_registration' | 'connect_failed' | 'connected_but_no_tools_for_model'
        toolId?: string
        detail?: string
    }>
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

export function describeUnavailableRuntimeTools(
    resolution: RuntimeToolResolution,
): string | null {
    if (resolution.selectedMcpServers.length === 0 || resolution.unavailableDetails.length === 0) {
        return null
    }

    const parts = resolution.unavailableDetails.map((detail) => {
        if (detail.reason === 'connected_but_no_tools_for_model' && detail.toolId) {
            return `${detail.serverName}: ${detail.toolId} is unavailable for the current model`
        }
        if (detail.reason === 'needs_auth') {
            return `${detail.serverName}: authentication required`
        }
        if (detail.reason === 'needs_client_registration') {
            return `${detail.serverName}: OAuth client registration required`
        }
        if (detail.reason === 'disabled') {
            return `${detail.serverName}: disabled in project config`
        }
        if (detail.reason === 'not_defined') {
            return `${detail.serverName}: not defined in project config`
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
    const res = await oc.mcp.status({ directory: cwd })
    return ((res as any).data || {}) as Record<string, any>
}

async function ensureConnectedServer(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    cwd: string,
    serverName: string,
    catalog: ProjectMcpCatalog,
    statusMap: Record<string, any>,
) {
    const config = catalog[serverName]
    if (!config) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'not_defined' as const,
                detail: 'Server is not defined in project config.json.',
            },
        }
    }

    if (!projectMcpEntryEnabled(config)) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'disabled' as const,
                detail: 'Server is disabled in project config.json.',
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
    } catch (error: any) {
        return {
            statusMap,
            unavailable: {
                serverName,
                reason: 'connect_failed' as const,
                detail: error?.message || 'Connection attempt failed.',
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
    model: ModelSelection,
    mcpServerNames: string[],
): Promise<RuntimeToolResolution> {
    const selectedMcpServers = unique(mcpServerNames)
    if (selectedMcpServers.length === 0) {
        return emptyResolution(selectedMcpServers)
    }

    const oc = await getOpencode()
    const catalog = await readProjectMcpCatalog(cwd)
    let mcpStatus = await currentMcpStatus(oc, cwd)
    const unavailableDetails: RuntimeToolResolution['unavailableDetails'] = []

    for (const serverName of selectedMcpServers) {
        const ensured = await ensureConnectedServer(oc, cwd, serverName, catalog, mcpStatus)
        mcpStatus = ensured.statusMap
        if (ensured.unavailable) {
            unavailableDetails.push(ensured.unavailable)
        }
    }

    const requestedTools = unique(
        selectedMcpServers.flatMap((serverName) =>
            ((mcpStatus[serverName]?.tools || []) as Array<{ name?: string }>)
                .map((tool) => tool.name || '')
        )
    )

    if (requestedTools.length === 0) {
        return {
            ...emptyResolution(selectedMcpServers),
            unavailableDetails,
        }
    }

    let availableTools: string[] = []
    if (model) {
        const toolListRes = await oc.tool.list({
            provider: model.provider,
            model: model.modelId,
            directory: cwd,
        })
        const items = ((toolListRes as any).data || []) as Array<{ id?: string }>
        availableTools = unique(items.map((item) => item.id || ''))
    } else {
        const toolIdsRes = await oc.tool.ids({
            directory: cwd,
        })
        availableTools = unique((((toolIdsRes as any).data || []) as string[]))
    }

    const availableSet = new Set(availableTools)
    const resolvedTools = requestedTools.filter((toolId) => availableSet.has(toolId))
    const unavailableTools = requestedTools.filter((toolId) => !availableSet.has(toolId))
    const toolServerNames = new Map<string, string[]>()
    for (const serverName of selectedMcpServers) {
        for (const tool of ((mcpStatus[serverName]?.tools || []) as Array<{ name?: string }>)) {
            const toolId = tool.name || ''
            if (!toolId) continue
            const current = toolServerNames.get(toolId) || []
            current.push(serverName)
            toolServerNames.set(toolId, current)
        }
    }
    for (const toolId of unavailableTools) {
        for (const serverName of toolServerNames.get(toolId) || []) {
            unavailableDetails.push({
                serverName,
                toolId,
                reason: 'connected_but_no_tools_for_model',
                detail: model
                    ? `${toolId} is not available for ${model.provider}/${model.modelId}.`
                    : `${toolId} is not available in the current runtime.`,
            })
        }
    }

    return {
        selectedMcpServers,
        requestedTools,
        availableTools,
        resolvedTools,
        unavailableTools,
        unavailableDetails,
    }
}
