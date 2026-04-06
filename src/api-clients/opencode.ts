import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import type { AdapterViewActionRequest, AdapterViewProjection } from '../../shared/adapter-view'
import type { McpCatalog } from '../../shared/mcp-catalog'
import type { FileStatus, ModelConfig, LspServerInfo } from '../types'
import { createApiEventSource, deleteJSON, fetchJSON, postJSON, putJSON } from '../api-core'

type ProviderOauthResponse = {
    method: 'auto' | 'code' | 'api'
    url?: string
    instructions?: string
}

type ProviderAuthMethod = {
    type: 'oauth' | 'api'
    label: string
}

export const opencodeApi = {
    health: () =>
        fetchJSON<{
            connected: boolean
            url: string
            error?: string
            managed?: boolean
            mode?: 'managed' | 'external'
            restartAvailable?: boolean
            project?: { worktree?: string }
        }>('/api/opencode/health'),

    restart: () =>
        postJSON<{ ok: boolean; managed: boolean; mode: 'managed' | 'external' }>('/api/opencode/restart'),

    applyRuntimeReload: () =>
        postJSON<{
            applied: boolean
            blocked: boolean
            runningSessions: number
            disposedDirectories: string[]
        }>('/api/opencode/runtime/apply'),

    lsp: {
        status: () => fetchJSON<LspServerInfo[]>('/api/lsp/status'),
    },

    mcp: {
        getCatalog: () => fetchJSON<McpCatalog>('/api/mcp/catalog'),
        updateCatalog: (catalog: McpCatalog) => putJSON<McpCatalog>('/api/mcp/catalog', catalog),
        list: () => fetchJSON<import('../types').McpServer[]>('/api/mcp/servers'),
        authStart: (name: string) => postJSON<{ authorizationUrl: string }>(`/api/mcp/${name}/auth/start`),
        authCallback: (name: string, code: string) => postJSON<unknown>(`/api/mcp/${name}/auth/callback`, { code }),
        authenticate: (name: string) => postJSON<unknown>(`/api/mcp/${name}/auth/authenticate`),
        clearAuth: (name: string) => deleteJSON<{ success: true }>(`/api/mcp/${name}/auth`),
        connect: (name: string) => postJSON<unknown>(`/api/mcp/${name}/connect`),
    },

    models: {
        list: () => fetchJSON<RuntimeModelCatalogEntry[]>('/api/models'),
    },

    agents: {
        list: () => fetchJSON<Array<{
            name: string
            model?: string
            description?: string
            color?: string
            mode?: 'subagent' | 'primary' | 'all'
            hidden?: boolean
            native?: boolean
            variant?: string
        }>>('/api/agents'),
    },

    tools: {
        list: () => fetchJSON<string[]>('/api/tools'),
        listForModel: (provider: string, model: string) => fetchJSON<Array<Record<string, unknown>>>(`/api/tools/${provider}/${model}`),
    },

    runtime: {
        resolveTools: (payload: { model: ModelConfig | null; mcpServerNames: string[] }) =>
            fetchJSON<import('../types').RuntimeToolResolution>('/api/runtime/tools', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
    },

    adapter: {
        list: (performerId?: string) =>
            fetchJSON<{ projections: AdapterViewProjection[] }>(
                `/api/adapter/views${performerId ? `?performerId=${encodeURIComponent(performerId)}` : ''}`,
            ),
        action: (payload: AdapterViewActionRequest) => postJSON<unknown>('/api/adapter/action', payload),
        events: () => createApiEventSource('/api/adapter/events'),
    },

    config: {
        getGlobal: () => fetchJSON<Record<string, unknown>>('/api/config'),
        updateGlobal: (config: Record<string, unknown>) => putJSON<unknown>('/api/config', config),
        getProject: () => fetchJSON<{ exists: boolean; path: string; config: Record<string, unknown> }>('/api/config/project'),
        updateProject: (config: Record<string, unknown>) => putJSON<unknown>('/api/config/project', config),
    },

    providers: {
        list: () => fetchJSON<Array<{
            id: string
            name: string
            source: string
            env: string[]
            connected: boolean
            modelCount: number
            defaultModel: string | null
            hasPaidModels: boolean
        }>>('/api/providers'),
    },

    provider: {
        authMethods: () => fetchJSON<Record<string, ProviderAuthMethod[]>>('/api/provider/auth'),
        oauthAuthorize: (providerId: string, method: number) => postJSON<ProviderOauthResponse>(`/api/provider/${providerId}/oauth/authorize`, { method }),
        oauthCallback: (providerId: string, method: number, code?: string) => postJSON<ProviderOauthResponse>(`/api/provider/${providerId}/oauth/callback`, code ? { method, code } : { method }),
        setAuth: (
            providerId: string,
            auth:
                | { type: 'api'; key: string }
                | { type: 'oauth'; refresh: string; access: string; expires: number; enterpriseUrl?: string }
                | { type: 'wellknown'; key: string; token: string },
        ) => putJSON<boolean>(`/api/provider/${providerId}/auth`, auth),
        clearAuth: (providerId: string) => deleteJSON<{ ok: boolean }>(`/api/provider/${providerId}/auth`),
    },

    file: {
        list: (path = '.') => fetchJSON<Array<Record<string, unknown>>>(`/api/file/list?path=${encodeURIComponent(path)}`),
        read: (path: string) => fetchJSON<unknown>(`/api/file/read?path=${encodeURIComponent(path)}`),
        status: () => fetchJSON<FileStatus[]>('/api/file/status'),
    },

    find: {
        text: (pattern: string) => fetchJSON<Array<Record<string, unknown>>>(`/api/find/text?pattern=${encodeURIComponent(pattern)}`),
        files: (pattern: string) => fetchJSON<string[]>(`/api/find/files?pattern=${encodeURIComponent(pattern)}`),
        symbols: (pattern: string) => fetchJSON<Array<Record<string, unknown>>>(`/api/find/symbols?pattern=${encodeURIComponent(pattern)}`),
    },

    vcs: {
        get: () => fetchJSON<{ branch?: string | null }>('/api/vcs'),
    },
}
