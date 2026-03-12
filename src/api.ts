// DOT Studio — API Client

import type {
    AssetRef,
    DanceDeliveryMode,
    DraftAsset,
    ModelConfig,
    PromptPreview,
    ActRunState,
    ActThreadResumeSummary,
    SavedStageSummary,
} from './types'
import type { RuntimeModelCatalogEntry } from '../shared/model-variants'
import { StudioApiError } from './lib/api-errors'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
let workingDirContext: string | null = null

function resolveWorkingDirContext() {
    return workingDirContext
}

function withWorkingDirQuery(url: string, workingDir: string | null) {
    if (!workingDir) {
        return url
    }
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}workingDir=${encodeURIComponent(workingDir)}`
}

export function setApiWorkingDirContext(workingDir: string | null) {
    workingDirContext = workingDir?.trim() ? workingDir.trim() : null
}

function absolutizeWorkspacePath(path: string, workingDir: string | null) {
    if (!path) {
        return path
    }
    if (path.startsWith('/') || path.startsWith('file://') || !workingDir) {
        return path
    }
    return `${workingDir.replace(/\/+$/, '')}/${path.replace(/^\.?\//, '')}`
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const workingDir = resolveWorkingDirContext()
    const res = await fetch(`${API_BASE}${withWorkingDirQuery(url, workingDir)}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(workingDir ? { 'X-DOT-Working-Dir': workingDir } : {}),
            ...init?.headers,
        },
    })
    if (!res.ok) {
        const raw = await res.text().catch(() => '')
        let payload: any = { error: raw || res.statusText }
        if (raw) {
            try {
                payload = JSON.parse(raw)
            } catch {
                payload = { error: raw }
            }
        }
        throw new StudioApiError(payload, res.status)
    }
    return res.json()
}

// ── Health ───────────────────────────────────────────
export const api = {
    health: () => fetchJSON<{ ok: boolean; project: string }>('/api/health'),

    opencodeHealth: () =>
        fetchJSON<{
            connected: boolean
            url: string
            error?: string
            managed?: boolean
            mode?: 'managed' | 'external'
            restartAvailable?: boolean
            project?: {
                worktree?: string
            }
        }>('/api/opencode/health'),

    opencodeRestart: () =>
        fetchJSON<{ ok: boolean; managed: boolean; mode: 'managed' | 'external' }>('/api/opencode/restart', {
            method: 'POST',
        }),

    // ── Assets ──────────────────────────────────────────
    assets: {
        list: (kind: string) =>
            fetchJSON<Array<{
                kind: string
                urn: string
                name: string
                author: string
                description: string
                [key: string]: any
            }>>(`/api/assets/${kind}`),

        get: (kind: string, author: string, name: string) =>
            fetchJSON<any>(`/api/assets/${kind}/${author}/${name}`),

        getRegistry: (kind: string, author: string, name: string) =>
            fetchJSON<any>(`/api/assets/registry/${kind}/${author}/${name}`),
    },

    // ── Stages ──────────────────────────────────────────
    stages: {
        list: () => fetchJSON<SavedStageSummary[]>('/api/stages'),
        get: (id: string) => fetchJSON<any>(`/api/stages/${id}`),
        save: (data: any) =>
            fetchJSON<{ ok: boolean; id: string; workingDir: string; updatedAt: number }>('/api/stages', {
                method: 'PUT',
                body: JSON.stringify(data),
            }),
        delete: (id: string) =>
            fetchJSON<{ ok: boolean }>(`/api/stages/${id}`, { method: 'DELETE' }),
    },

    // ── Compile ─────────────────────────────────────────
    compile: (
        talRef: AssetRef | null,
        danceRefs: AssetRef[],
        model: ModelConfig | null,
        modelVariant: string | null,
        agentId: string | null,
        mcpServerNames: string[],
        drafts: Record<string, DraftAsset>,
        planMode = false,
        danceDeliveryMode: DanceDeliveryMode = 'auto',
    ) =>
        fetchJSON<PromptPreview>('/api/compile', {
            method: 'POST',
            body: JSON.stringify({ talRef, danceRefs, drafts, model, modelVariant, agentId, mcpServerNames, planMode, danceDeliveryMode }),
        }),

    // ── Chat ────────────────────────────────────────────
    chat: {
        createSession: (performerId: string, performerName: string, configHash: string) =>
            fetchJSON<{ sessionId: string; title: string }>('/api/chat/sessions', {
                method: 'POST',
                body: JSON.stringify({ performerId, performerName, configHash }),
            }),

        deleteSession: (id: string) =>
            fetchJSON<{ ok: boolean }>(`/api/chat/sessions/${id}`, {
                method: 'DELETE',
            }),

        updateSession: (id: string, title: string) =>
            fetchJSON<any>(`/api/chat/sessions/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ title }),
            }),

        send: (
            id: string,
            payload: {
                message: string
                performer: {
                    talRef: AssetRef | null
                    danceRefs: AssetRef[]
                    extraDanceRefs?: AssetRef[]
                    drafts?: Record<string, DraftAsset>
                    model?: ModelConfig | null
                    modelVariant?: string | null
                    agentId?: string | null
                    mcpServerNames?: string[]
                    danceDeliveryMode?: DanceDeliveryMode
                    planMode?: boolean
                    configHash?: string
                }
                attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
            }
        ) =>
            fetchJSON<{ accepted: boolean }>(`/api/chat/sessions/${id}/send`, {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        abort: (id: string) =>
            fetchJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/abort`, {
                method: 'POST',
            }),

        messages: (id: string) =>
            fetchJSON<any[]>(`/api/chat/sessions/${id}/messages`),

        diff: (id: string) =>
            fetchJSON<any[]>(`/api/chat/sessions/${id}/diff`),

        todo: (id: string) =>
            fetchJSON<Array<{ id: string; content: string; status: string; priority: string }>>(`/api/chat/sessions/${id}/todo`),

        fork: (id: string, messageId: string) =>
            fetchJSON<any>(`/api/chat/sessions/${id}/fork`, {
                method: 'POST',
                body: JSON.stringify({ messageId }),
            }),

        share: (id: string) =>
            fetchJSON<{ url: string }>(`/api/chat/sessions/${id}/share`, {
                method: 'POST',
            }),

        summarize: (
            id: string,
            payload?: {
                providerID?: string
                modelID?: string
                auto?: boolean
            },
        ) =>
            fetchJSON<boolean>(`/api/chat/sessions/${id}/summarize`, {
                method: 'POST',
                body: JSON.stringify(payload || {}),
            }),

        revert: (id: string, messageId: string, partId?: string) =>
            fetchJSON<any>(`/api/chat/sessions/${id}/revert`, {
                method: 'POST',
                body: JSON.stringify({ messageId, partId }),
            }),

        unrevert: (id: string) =>
            fetchJSON<any>(`/api/chat/sessions/${id}/unrevert`, {
                method: 'POST',
            }),

        list: () =>
            fetchJSON<any[]>('/api/chat/sessions'),

        events: () => {
            const eventSource = new EventSource(`${API_BASE}${withWorkingDirQuery('/api/chat/events', resolveWorkingDirContext())}`)
            return eventSource
        },
    },

    act: {
        run: (payload: {
            actSessionId?: string
            actUrn?: string
            stageAct?: any
            performers?: any[]
            drafts?: Record<string, DraftAsset>
            input: string
            maxIterations?: number
            resumeSummary?: ActThreadResumeSummary
        }) =>
            fetchJSON<ActRunState>('/api/act/run', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        abort: (actSessionId: string) =>
            fetchJSON<{ ok: boolean }>(`/api/act/sessions/${actSessionId}/abort`, {
                method: 'POST',
            }),

        events: (actSessionId: string) => {
            const workingDir = resolveWorkingDirContext()
            const base = withWorkingDirQuery(`/api/act/events?actSessionId=${encodeURIComponent(actSessionId)}`, workingDir)
            return new EventSource(`${API_BASE}${base}`)
        },
    },

    // ── LSP (from OpenCode SDK) ───────────────────────────
    lsp: {
        status: () => fetchJSON<any[]>('/api/lsp/status'),
    },

    // ── MCP (from OpenCode SDK) ───────────────────────────
    mcp: {
        list: () =>
            fetchJSON<import('./types').McpServer[]>('/api/mcp/servers'),

        add: (name: string, config: { command: string; args?: string[] } | { url: string }) =>
            fetchJSON<any>('/api/mcp/add', {
                method: 'POST',
                body: JSON.stringify({ name, config }),
            }),

        authStart: (name: string) =>
            fetchJSON<{ authorizationUrl: string }>(`/api/mcp/${name}/auth/start`, {
                method: 'POST',
            }),

        authCallback: (name: string, code: string) =>
            fetchJSON<any>(`/api/mcp/${name}/auth/callback`, {
                method: 'POST',
                body: JSON.stringify({ code }),
            }),

        authenticate: (name: string) =>
            fetchJSON<any>(`/api/mcp/${name}/auth/authenticate`, {
                method: 'POST',
            }),

        clearAuth: (name: string) =>
            fetchJSON<{ success: true }>(`/api/mcp/${name}/auth`, {
                method: 'DELETE',
            }),

        connect: (name: string) =>
            fetchJSON<any>(`/api/mcp/${name}/connect`, { method: 'POST' }),

        disconnect: (name: string) =>
            fetchJSON<any>(`/api/mcp/${name}/disconnect`, { method: 'POST' }),
    },

    // ── Models (from OpenCode SDK) ───────────────────────
    models: {
        list: () =>
            fetchJSON<RuntimeModelCatalogEntry[]>('/api/models'),
    },

    // ── Agents (from OpenCode SDK) ───────────────────────
    agents: {
        list: () =>
            fetchJSON<Array<{
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

    // ── Tools (from OpenCode SDK) ────────────────────────
    tools: {
        list: () =>
            fetchJSON<string[]>('/api/tools'),

        listForModel: (provider: string, model: string) =>
            fetchJSON<any[]>(`/api/tools/${provider}/${model}`),
    },

    runtime: {
        resolveTools: (payload: { model: ModelConfig | null; mcpServerNames: string[] }) =>
            fetchJSON<import('./types').RuntimeToolResolution>('/api/runtime/tools', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
    },

    // ── Config (from OpenCode SDK) ───────────────────────
    config: {
        get: () => fetchJSON<any>('/api/config'),

        getProject: () =>
            fetchJSON<{ exists: boolean; path: string; config: any }>('/api/config/project'),

        update: (config: any) =>
            fetchJSON<any>('/api/config', {
                method: 'PUT',
                body: JSON.stringify(config),
            }),
    },

    // ── Provider Auth (from OpenCode SDK) ────────────────
    providers: {
        list: () =>
            fetchJSON<Array<{
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

        oauthAuthorize: (providerId: string, method: number) =>
            fetchJSON<any>(`/api/provider/${providerId}/oauth/authorize`, {
                method: 'POST',
                body: JSON.stringify({ method }),
            }),

        oauthCallback: (providerId: string, method: number, code?: string) =>
            fetchJSON<any>(`/api/provider/${providerId}/oauth/callback`, {
                method: 'POST',
                body: JSON.stringify(code ? { method, code } : { method }),
            }),

        setAuth: (
            providerId: string,
            auth:
                | { type: 'api'; key: string }
                | { type: 'oauth'; refresh: string; access: string; expires: number; enterpriseUrl?: string }
                | { type: 'wellknown'; key: string; token: string },
        ) =>
            fetchJSON<boolean>(`/api/provider/${providerId}/auth`, {
                method: 'PUT',
                body: JSON.stringify(auth),
            }),

        clearAuth: (providerId: string) =>
            fetchJSON<{ ok: boolean }>(`/api/provider/${providerId}/auth`, {
                method: 'DELETE',
            }),
    },

    // ── File (from OpenCode SDK) ─────────────────────────
    file: {
        list: (path = '.') =>
            fetchJSON<any[]>(`/api/file/list?path=${encodeURIComponent(path)}`),

        read: (path: string) =>
            fetchJSON<any>(`/api/file/read?path=${encodeURIComponent(path)}`),

        status: () => fetchJSON<any[]>('/api/file/status'),
    },

    // ── Find (from OpenCode SDK) ─────────────────────────
    find: {
        text: (pattern: string) =>
            fetchJSON<any[]>(`/api/find/text?pattern=${encodeURIComponent(pattern)}`),

        files: (pattern: string) =>
            fetchJSON<string[]>(`/api/find/files?pattern=${encodeURIComponent(pattern)}`),

        symbols: (pattern: string) =>
            fetchJSON<any[]>(`/api/find/symbols?pattern=${encodeURIComponent(pattern)}`),
    },

    // ── VCS / Git (from OpenCode SDK) ────────────────────
    vcs: {
        get: () => fetchJSON<any>('/api/vcs'),
    },

    // ── Workspace ───────────────────────────────────────
    workspace: {
        findFiles: async (query: string) => {
            const normalized = query.trim()

            if (!normalized) {
                const entries = await api.file.list('.')
                return entries
                    .filter((entry) => entry.type === 'file')
                    .map((entry) => ({
                        name: entry.name,
                        path: entry.path,
                        absolute: absolutizeWorkspacePath(entry.absolute || entry.path, resolveWorkingDirContext()),
                        type: entry.type,
                    }))
            }

            const entries = await fetchJSON<Array<string | {
                name: string
                path: string
                absolute: string
                type: string
            }>>(`/api/find/files?pattern=${encodeURIComponent(normalized)}`)

            return entries
                .map((entry) => {
                    if (typeof entry === 'string') {
                        return {
                            name: entry.split('/').pop() || entry,
                            path: entry,
                            absolute: absolutizeWorkspacePath(entry, resolveWorkingDirContext()),
                            type: 'file',
                        }
                    }
                    return {
                        name: entry.name,
                        path: entry.path,
                        absolute: absolutizeWorkspacePath(entry.absolute || entry.path, resolveWorkingDirContext()),
                        type: entry.type,
                    }
                })
                .filter((entry) => entry.type === 'file')
        },
    },

    // ── Studio Config ───────────────────────────────────
    studio: {
        getConfig: () =>
            fetchJSON<{ theme?: string; lastStage?: string; openCodeUrl?: string; projectDir?: string }>('/api/studio/config'),

        updateConfig: (config: Record<string, any>) =>
            fetchJSON<any>('/api/studio/config', {
                method: 'PUT',
                body: JSON.stringify(config),
            }),

        activate: (workingDir: string) =>
            fetchJSON<{ ok: boolean; activeProjectDir: string }>('/api/studio/activate', {
                method: 'POST',
                body: JSON.stringify({ workingDir }),
            }),

        pickDirectory: () => fetchJSON<{ path?: string; error?: string }>('/api/studio/pick-directory'),
    },

    // ── DOT Integration ─────────────────────────────────
    dot: {
        status: () =>
            fetchJSON<{ initialized: boolean; dotDir: string; projectDir: string }>('/api/dot/status'),

        authUser: () =>
            fetchJSON<{ authenticated: boolean; username: string | null }>('/api/dot/auth-user'),

        login: (acknowledgedTos = false) =>
            fetchJSON<{
                ok: boolean
                started: boolean
                alreadyRunning?: boolean
                alreadyAuthenticated?: boolean
                username?: string | null
                authUrl?: string
                browserOpened?: boolean
            }>('/api/dot/login', {
                method: 'POST',
                body: JSON.stringify({ acknowledgedTos }),
            }),

        logout: () =>
            fetchJSON<{ ok: boolean }>('/api/dot/logout', {
                method: 'POST',
            }),

        init: () =>
            fetchJSON<{ ok: boolean; dotDir: string }>('/api/dot/init', { method: 'POST' }),

        performers: () =>
            fetchJSON<{ names: string[]; skipped: Array<{ file: string; reason: string }> }>('/api/dot/performers'),

        performer: (name: string) =>
            fetchJSON<any>(`/api/dot/performers/${name}`),

        agents: () =>
            fetchJSON<Record<string, string>>('/api/dot/agents'),

        updateAgents: (manifest: Record<string, string>) =>
            fetchJSON<{ ok: boolean }>('/api/dot/agents', {
                method: 'PUT',
                body: JSON.stringify(manifest),
            }),

        install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') =>
            fetchJSON<any>('/api/dot/install', {
                method: 'POST',
                body: JSON.stringify({ urn, localName, force, scope }),
            }),

        saveLocalAsset: (
            kind: 'tal' | 'dance' | 'performer' | 'act',
            slug: string,
            payload: Record<string, unknown>,
            author?: string,
        ) =>
            fetchJSON<{ ok: boolean; urn: string; path: string; existed: boolean; payload: Record<string, unknown> }>('/api/dot/assets/local', {
                method: 'PUT',
                body: JSON.stringify({ kind, slug, payload, author }),
            }),

        publishAsset: (
            kind: 'tal' | 'dance' | 'performer' | 'act',
            slug: string,
            payload?: Record<string, unknown>,
            tags?: string[],
            acknowledgedTos = false,
        ) =>
            fetchJSON<{
                ok: boolean
                urn: string
                published: boolean
                dependenciesPublished: string[]
                dependenciesSkipped: string[]
                dependenciesExisting: string[]
            }>('/api/dot/assets/publish', {
                method: 'POST',
                body: JSON.stringify({ kind, slug, payload, tags, acknowledgedTos }),
            }),

        search: (query: string, kind?: string, limit?: number) =>
            fetchJSON<Array<{ kind: string; name: string; author: string; slug: string; description: string; tags: string[] }>>(
                `/api/dot/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`
            ),

        validate: (performer: any) =>
            fetchJSON<{ valid: boolean; error?: string }>('/api/dot/validate', {
                method: 'POST',
                body: JSON.stringify(performer),
            }),
    },
}
