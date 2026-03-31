import fs from 'fs/promises'
import path from 'path'
import stripJsonComments from 'strip-json-comments'
import {
    extractProjectMcpCatalog,
    projectMcpEntryEnabled,
    projectMcpEntryType,
    type ProjectMcpCatalog,
    type ProjectMcpEntryConfig,
} from '../../shared/project-mcp.js'

export type ProjectMcpLiveStatusEntry = {
    status?: string
    tools?: Array<{ name?: string } | Record<string, unknown>>
    resources?: unknown[]
    error?: string
}

export type ProjectMcpLiveStatusMap = Record<string, ProjectMcpLiveStatusEntry>

const PROJECT_CONFIG_FILENAMES = ['opencode.json', 'opencode.jsonc', 'config.json'] as const

export async function resolveProjectConfigPath(cwd: string): Promise<string> {
    for (const filename of PROJECT_CONFIG_FILENAMES) {
        const filePath = path.join(cwd, filename)
        try {
            await fs.access(filePath)
            return filePath
        } catch {
            continue
        }
    }

    return path.join(cwd, 'opencode.json')
}

export async function resolveProjectConfigWritePath(cwd: string): Promise<string> {
    for (const filename of ['opencode.json', 'opencode.jsonc'] as const) {
        const filePath = path.join(cwd, filename)
        try {
            await fs.access(filePath)
            return filePath
        } catch {
            continue
        }
    }

    return path.join(cwd, 'opencode.json')
}

export async function readProjectConfigFile(cwd: string): Promise<Record<string, unknown>> {
    const filePath = await resolveProjectConfigPath(cwd)
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(stripJsonComments(raw))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function writeProjectConfigFile(cwd: string, config: Record<string, unknown>): Promise<string> {
    const filePath = await resolveProjectConfigWritePath(cwd)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    return filePath
}

export async function readProjectMcpCatalog(cwd: string): Promise<ProjectMcpCatalog> {
    const config = await readProjectConfigFile(cwd)
    return extractProjectMcpCatalog(config)
}

export function summarizeProjectMcpCatalog(
    catalog: ProjectMcpCatalog,
    liveStatus: ProjectMcpLiveStatusMap,
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
            const oauthConfig = config && 'type' in config && config.type === 'remote'
                ? config.oauth
                : undefined
            return {
                name,
                status,
                tools: live?.tools || [],
                resources: live?.resources || [],
                enabled: config ? projectMcpEntryEnabled(config) : false,
                defined: !!config,
                configType: projectMcpEntryType(config),
                authStatus: status === 'needs_auth' ? 'needs_auth' : status === 'connected' ? 'ready' : 'n/a',
                error: typeof live?.error === 'string' ? live.error : undefined,
                oauthConfigured: !!(
                    oauthConfig
                    && typeof oauthConfig === 'object'
                    && (oauthConfig.clientId || oauthConfig.clientSecret || oauthConfig.scope)
                ),
                clientRegistrationRequired: status === 'needs_client_registration',
            }
        })
}
