import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import type { AdapterViewActionRequest, AdapterViewProjection } from '../../shared/adapter-view'
import type { ModelConfig } from '../types'
import { createApiEventSource, deleteJSON, fetchJSON, postJSON, putJSON } from '../api-core'

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

    lsp: {
        status: () => fetchJSON<any[]>('/api/lsp/status'),
    },

    mcp: {
        list: () => fetchJSON<import('../types').McpServer[]>('/api/mcp/servers'),
        add: (name: string, config: { command: string; args?: string[] } | { url: string }) => postJSON<any>('/api/mcp/add', { name, config }),
        authStart: (name: string) => postJSON<{ authorizationUrl: string }>(`/api/mcp/${name}/auth/start`),
        authCallback: (name: string, code: string) => postJSON<any>(`/api/mcp/${name}/auth/callback`, { code }),
        authenticate: (name: string) => postJSON<any>(`/api/mcp/${name}/auth/authenticate`),
        clearAuth: (name: string) => deleteJSON<{ success: true }>(`/api/mcp/${name}/auth`),
        connect: (name: string) => postJSON<any>(`/api/mcp/${name}/connect`),
        disconnect: (name: string) => postJSON<any>(`/api/mcp/${name}/disconnect`),
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
        listForModel: (provider: string, model: string) => fetchJSON<any[]>(`/api/tools/${provider}/${model}`),
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
        action: (payload: AdapterViewActionRequest) => postJSON<any>('/api/adapter/action', payload),
        events: () => createApiEventSource('/api/adapter/events'),
    },

    config: {
        get: () => fetchJSON<any>('/api/config'),
        getProject: () => fetchJSON<{ exists: boolean; path: string; config: any }>('/api/config/project'),
        update: (config: any) => putJSON<any>('/api/config', config),
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
        }>>('/api/providers'),
    },

    provider: {
        auth: () => fetchJSON<any>('/api/provider/auth'),
        oauthAuthorize: (providerId: string, method: number) => postJSON<any>(`/api/provider/${providerId}/oauth/authorize`, { method }),
        oauthCallback: (providerId: string, method: number, code?: string) => postJSON<any>(`/api/provider/${providerId}/oauth/callback`, code ? { method, code } : { method }),
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
        list: (path = '.') => fetchJSON<any[]>(`/api/file/list?path=${encodeURIComponent(path)}`),
        read: (path: string) => fetchJSON<any>(`/api/file/read?path=${encodeURIComponent(path)}`),
        status: () => fetchJSON<any[]>('/api/file/status'),
    },

    find: {
        text: (pattern: string) => fetchJSON<any[]>(`/api/find/text?pattern=${encodeURIComponent(pattern)}`),
        files: (pattern: string) => fetchJSON<string[]>(`/api/find/files?pattern=${encodeURIComponent(pattern)}`),
        symbols: (pattern: string) => fetchJSON<any[]>(`/api/find/symbols?pattern=${encodeURIComponent(pattern)}`),
    },

    vcs: {
        get: () => fetchJSON<any>('/api/vcs'),
    },
}
