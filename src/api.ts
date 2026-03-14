// DOT Studio — API Client

import type {
    AssetRef,
    DanceDeliveryMode,
    DraftAsset,
    ModelConfig,
    PromptPreview,
    SavedStageSummary,
} from './types'
import type { RuntimeModelCatalogEntry } from '../shared/model-variants'
import type { AdapterViewActionRequest, AdapterViewProjection } from '../shared/adapter-view'

import type { AssetListItem } from '../shared/asset-contracts'
import type { ChatSendRequest, ChatSessionCreateResponse, CompilePromptRequest } from '../shared/chat-contracts'
import type { ExecutionMode, SafeOwnerKind, SafeOwnerSummary } from '../shared/safe-mode'
import type { DotAuthUserResponse, DotInitResponse, DotInstallRequest, DotLoginResponse, DotPublishRequest, DotSaveLocalRequest, DotStatusResponse } from '../shared/dot-contracts'
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

function withApiBase(url: string) {
    return `${API_BASE}${withWorkingDirQuery(url, resolveWorkingDirContext())}`
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const workingDir = resolveWorkingDirContext()
    const res = await fetch(withApiBase(url), {
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

function postJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'POST',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

function putJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'PUT',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

function deleteJSON<T>(url: string) {
    return fetchJSON<T>(url, { method: 'DELETE' })
}

function createApiEventSource(url: string) {
    return new EventSource(withApiBase(url))
}

type WorkspaceFileEntry =
    | string
    | {
        name: string
        path: string
        absolute: string
        type: string
    }

function normalizeWorkspaceFileEntry(entry: WorkspaceFileEntry) {
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
        postJSON<{ ok: boolean; managed: boolean; mode: 'managed' | 'external' }>('/api/opencode/restart'),

    // ── Assets ──────────────────────────────────────────
    assets: {
        list: (kind: string) =>
            fetchJSON<AssetListItem[]>(`/api/assets/${kind}`),

        get: (kind: string, author: string, name: string) =>
            fetchJSON<AssetListItem>(`/api/assets/${kind}/${author}/${name}`),

        getRegistry: (kind: string, author: string, name: string) =>
            fetchJSON<AssetListItem>(`/api/assets/registry/${kind}/${author}/${name}`),
    },

    // ── Stages ──────────────────────────────────────────
    stages: {
        list: () => fetchJSON<SavedStageSummary[]>('/api/stages'),
        get: (id: string) => fetchJSON<any>(`/api/stages/${id}`),
        save: (data: any) =>
            putJSON<{ ok: boolean; id: string; workingDir: string; updatedAt: number }>('/api/stages', data),
        delete: (id: string) =>
            deleteJSON<{ ok: boolean }>(`/api/stages/${id}`),
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
        postJSON<PromptPreview>('/api/compile', {
            talRef,
            danceRefs,
            drafts,
            model,
            modelVariant,
            agentId,
            mcpServerNames,
            planMode,
            danceDeliveryMode,
        } satisfies CompilePromptRequest),

    // ── Chat ────────────────────────────────────────────
    chat: {
        createSession: (performerId: string, performerName: string, configHash: string, executionMode: ExecutionMode) =>
            postJSON<ChatSessionCreateResponse>('/api/chat/sessions', { performerId, performerName, configHash, executionMode }),

        deleteSession: (id: string) =>
            deleteJSON<{ ok: boolean }>(`/api/chat/sessions/${id}`),

        updateSession: (id: string, title: string) =>
            putJSON<any>(`/api/chat/sessions/${id}`, { title }),

        send: (
            id: string,
            payload: {
                message: string
                performer: {
                    performerId: string
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
                    description?: string
                }
                attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
                mentions?: Array<{ performerId: string }>
            }
        ) =>
            postJSON<{ accepted: boolean }>(`/api/chat/sessions/${id}/send`, payload satisfies ChatSendRequest),

        abort: (id: string) =>
            postJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/abort`),

        messages: (id: string) =>
            fetchJSON<any[]>(`/api/chat/sessions/${id}/messages`),

        diff: (id: string) =>
            fetchJSON<any[]>(`/api/chat/sessions/${id}/diff`),

        todo: (id: string) =>
            fetchJSON<Array<{ id: string; content: string; status: string; priority: string }>>(`/api/chat/sessions/${id}/todo`),

        fork: (id: string, messageId: string) =>
            postJSON<any>(`/api/chat/sessions/${id}/fork`, { messageId }),

        share: (id: string) =>
            postJSON<{ url: string }>(`/api/chat/sessions/${id}/share`),

        summarize: (
            id: string,
            payload?: {
                providerID?: string
                modelID?: string
                auto?: boolean
            },
        ) =>
            postJSON<boolean>(`/api/chat/sessions/${id}/summarize`, payload || {}),

        revert: (id: string, messageId: string, partId?: string) =>
            postJSON<any>(`/api/chat/sessions/${id}/revert`, { messageId, partId }),

        list: () =>
            fetchJSON<any[]>('/api/chat/sessions'),

        events: () => createApiEventSource('/api/chat/events'),
    },

    safe: {
        summary: (ownerKind: SafeOwnerKind, ownerId: string) =>
            fetchJSON<SafeOwnerSummary>(`/api/safe/${ownerKind}/${encodeURIComponent(ownerId)}`),

        apply: (ownerKind: SafeOwnerKind, ownerId: string) =>
            postJSON<SafeOwnerSummary>(`/api/safe/${ownerKind}/${encodeURIComponent(ownerId)}/apply`),

        discardFile: (ownerKind: SafeOwnerKind, ownerId: string, filePath: string) =>
            postJSON<SafeOwnerSummary>(`/api/safe/${ownerKind}/${encodeURIComponent(ownerId)}/discard`, { filePath }),

        discardAll: (ownerKind: SafeOwnerKind, ownerId: string) =>
            postJSON<SafeOwnerSummary>(`/api/safe/${ownerKind}/${encodeURIComponent(ownerId)}/discard-all`),

        undoLastApply: (ownerKind: SafeOwnerKind, ownerId: string) =>
            postJSON<SafeOwnerSummary>(`/api/safe/${ownerKind}/${encodeURIComponent(ownerId)}/undo-last-apply`),
    },

    // Act runtime removed (Phase 2 pending)

    // ── LSP (from OpenCode SDK) ───────────────────────────
    lsp: {
        status: () => fetchJSON<any[]>('/api/lsp/status'),
    },

    // ── MCP (from OpenCode SDK) ───────────────────────────
    mcp: {
        list: () =>
            fetchJSON<import('./types').McpServer[]>('/api/mcp/servers'),

        add: (name: string, config: { command: string; args?: string[] } | { url: string }) =>
            postJSON<any>('/api/mcp/add', { name, config }),

        authStart: (name: string) =>
            postJSON<{ authorizationUrl: string }>(`/api/mcp/${name}/auth/start`),

        authCallback: (name: string, code: string) =>
            postJSON<any>(`/api/mcp/${name}/auth/callback`, { code }),

        authenticate: (name: string) =>
            postJSON<any>(`/api/mcp/${name}/auth/authenticate`),

        clearAuth: (name: string) =>
            deleteJSON<{ success: true }>(`/api/mcp/${name}/auth`),

        connect: (name: string) =>
            postJSON<any>(`/api/mcp/${name}/connect`),

        disconnect: (name: string) =>
            postJSON<any>(`/api/mcp/${name}/disconnect`),
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

    adapter: {
        list: (performerId?: string) =>
            fetchJSON<{ projections: AdapterViewProjection[] }>(
                `/api/adapter/views${performerId ? `?performerId=${encodeURIComponent(performerId)}` : ''}`,
            ),

        action: (payload: AdapterViewActionRequest) =>
            postJSON<any>('/api/adapter/action', payload),

        events: () => createApiEventSource('/api/adapter/events'),
    },

    // ── Config (from OpenCode SDK) ───────────────────────
    config: {
        get: () => fetchJSON<any>('/api/config'),

        getProject: () =>
            fetchJSON<{ exists: boolean; path: string; config: any }>('/api/config/project'),

        update: (config: any) =>
            putJSON<any>('/api/config', config),
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
            postJSON<any>(`/api/provider/${providerId}/oauth/authorize`, { method }),

        oauthCallback: (providerId: string, method: number, code?: string) =>
            postJSON<any>(`/api/provider/${providerId}/oauth/callback`, code ? { method, code } : { method }),

        setAuth: (
            providerId: string,
            auth:
                | { type: 'api'; key: string }
                | { type: 'oauth'; refresh: string; access: string; expires: number; enterpriseUrl?: string }
                | { type: 'wellknown'; key: string; token: string },
        ) =>
            putJSON<boolean>(`/api/provider/${providerId}/auth`, auth),

        clearAuth: (providerId: string) =>
            deleteJSON<{ ok: boolean }>(`/api/provider/${providerId}/auth`),
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
                .map((entry) => normalizeWorkspaceFileEntry(entry))
                .filter((entry) => entry.type === 'file')
        },
    },

    // ── Studio Config ───────────────────────────────────
    studio: {
        getConfig: () =>
            fetchJSON<{ theme?: string; lastStage?: string; openCodeUrl?: string; projectDir?: string }>('/api/studio/config'),

        updateConfig: (config: Record<string, any>) =>
            putJSON<any>('/api/studio/config', config),

        activate: (workingDir: string) =>
            postJSON<{ ok: boolean; activeProjectDir: string }>('/api/studio/activate', { workingDir }),

        pickDirectory: () => fetchJSON<{ path?: string; error?: string }>('/api/studio/pick-directory'),
    },

    // ── DOT Integration ─────────────────────────────────
    dot: {
        status: () =>
            fetchJSON<DotStatusResponse>('/api/dot/status'),

        authUser: () =>
            fetchJSON<DotAuthUserResponse>('/api/dot/auth-user'),

        login: (acknowledgedTos = false) =>
            postJSON<DotLoginResponse>('/api/dot/login', { acknowledgedTos }),

        logout: () =>
            postJSON<{ ok: boolean }>('/api/dot/logout'),

        init: () =>
            postJSON<DotInitResponse>('/api/dot/init'),

        performers: () =>
            fetchJSON<{ names: string[]; skipped: Array<{ file: string; reason: string }> }>('/api/dot/performers'),

        performer: (name: string) =>
            fetchJSON<any>(`/api/dot/performers/${name}`),

        agents: () =>
            fetchJSON<Record<string, string>>('/api/dot/agents'),

        updateAgents: (manifest: Record<string, string>) =>
            putJSON<{ ok: boolean }>('/api/dot/agents', manifest),

        install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') =>
            postJSON<any>('/api/dot/install', { urn, localName, force, scope } satisfies DotInstallRequest),

        saveLocalAsset: (
            kind: 'tal' | 'dance' | 'performer' | 'act',
            slug: string,
            payload: Record<string, unknown>,
            author?: string,
        ) =>
            putJSON<{ ok: boolean; urn: string; path: string; existed: boolean; payload: Record<string, unknown> }>('/api/dot/assets/local', { kind, slug, payload, author } satisfies DotSaveLocalRequest),

        publishAsset: (
            kind: 'tal' | 'dance' | 'performer' | 'act',
            slug: string,
            payload?: Record<string, unknown>,
            tags?: string[],
            acknowledgedTos = false,
        ) =>
            postJSON<{
                ok: boolean
                urn: string
                published: boolean
                dependenciesPublished: string[]
                dependenciesSkipped: string[]
                dependenciesExisting: string[]
            }>('/api/dot/assets/publish', { kind, slug, payload, tags, acknowledgedTos } satisfies DotPublishRequest),

        search: (query: string, kind?: string, limit?: number) =>
            fetchJSON<Array<{ kind: string; name: string; author: string; slug: string; description: string; tags: string[] }>>(
                `/api/dot/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`
            ),

        validate: (performer: any) =>
            postJSON<{ valid: boolean; error?: string }>('/api/dot/validate', performer),
    },
}
