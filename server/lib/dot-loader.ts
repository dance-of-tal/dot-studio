import path from 'path'
import { createHash } from 'crypto'
import { getOpencode } from './opencode.js'
import { unwrapOpencodeResult } from './opencode-errors.js'
import { resolvePackageBin } from './package-bin.js'
import type { ProjectMcpLiveStatusMap } from './project-config.js'

type McpAddConfig = {
    type: 'local'
    command: string[]
    enabled?: boolean
    environment?: Record<string, string>
}

export const CAPABILITY_LOADER_TOOL_NAME = 'load_capability_context'

function resolveDotCommand(): string {
    return resolvePackageBin('dance-of-tal', 'dance-of-tal') || 'dance-of-tal'
}

export function dotLoaderServerName(cwd: string): string {
    const hash = createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 10)
    return `dot-stage-${hash}`
}

function resolveCapabilityToolId(toolIds: string[]) {
    const exact = toolIds.find((toolId) => toolId === CAPABILITY_LOADER_TOOL_NAME)
    if (exact) {
        return exact
    }

    return toolIds.find((toolId) => (
        toolId.endsWith(`/${CAPABILITY_LOADER_TOOL_NAME}`)
        || toolId.endsWith(`:${CAPABILITY_LOADER_TOOL_NAME}`)
        || toolId.endsWith(`.${CAPABILITY_LOADER_TOOL_NAME}`)
    )) || null
}

export async function ensureDotLoaderServer(cwd: string): Promise<{
    available: boolean
    serverName: string
    toolName: string
}> {
    const serverName = dotLoaderServerName(cwd)
    const oc = await getOpencode()
    const params = { directory: path.resolve(cwd) }
    const statusData = unwrapOpencodeResult<ProjectMcpLiveStatusMap>(await oc.mcp.status(params)) || {}
    const existing = statusData[serverName]

    if (!existing) {
        const config = {
            type: 'local',
            command: [resolveDotCommand()],
            enabled: true,
            environment: {
                DANCE_OF_TAL_PROJECT_DIR: path.resolve(cwd),
            },
        } as unknown as McpAddConfig
        unwrapOpencodeResult(await oc.mcp.add({
            ...params,
            name: serverName,
            config,
        }))
    }

    const refreshedStatusData = unwrapOpencodeResult<ProjectMcpLiveStatusMap>(await oc.mcp.status(params)) || {}
    const status = refreshedStatusData[serverName]

    if (!status || status.status !== 'connected') {
        unwrapOpencodeResult(await oc.mcp.connect({
            name: serverName,
            ...params,
        }))
    }

    const toolIds = unwrapOpencodeResult<string[]>(await oc.tool.ids(params)) || []
    const resolvedToolId = resolveCapabilityToolId(toolIds)
    if (!resolvedToolId) {
        throw new Error(`Capability loader tool '${CAPABILITY_LOADER_TOOL_NAME}' is unavailable after MCP connection.`)
    }

    return {
        available: true,
        serverName,
        toolName: resolvedToolId,
    }
}
