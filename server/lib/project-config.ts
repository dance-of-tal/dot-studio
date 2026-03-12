import fs from 'fs/promises'
import path from 'path'
import {
    extractProjectMcpCatalog,
    projectMcpEntryEnabled,
    projectMcpEntryType,
    type ProjectMcpCatalog,
    type ProjectMcpEntryConfig,
} from '../../shared/project-mcp.js'

export async function readProjectConfigFile(cwd: string): Promise<Record<string, unknown>> {
    try {
        const raw = await fs.readFile(path.join(cwd, 'config.json'), 'utf-8')
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function readProjectMcpCatalog(cwd: string): Promise<ProjectMcpCatalog> {
    const config = await readProjectConfigFile(cwd)
    return extractProjectMcpCatalog(config)
}

export function summarizeProjectMcpCatalog(
    catalog: ProjectMcpCatalog,
    liveStatus: Record<string, any>,
) {
    return Object.keys({
        ...catalog,
        ...liveStatus,
    })
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
            const config = catalog[name] as ProjectMcpEntryConfig | undefined
            const live = liveStatus[name]
            const status = live?.status || (config ? (projectMcpEntryEnabled(config) ? 'disconnected' : 'disabled') : 'unknown')
            return {
                name,
                status,
                tools: live?.tools || [],
                resources: live?.resources || [],
                enabled: config ? projectMcpEntryEnabled(config) : false,
                defined: !!config,
                configType: projectMcpEntryType(config),
                authStatus: status === 'needs_auth' ? 'needs_auth' : status === 'connected' ? 'ready' : 'n/a',
            }
        })
}
