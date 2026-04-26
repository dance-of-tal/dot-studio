// DOT Studio — API Client

import type {
    ActThreadStatus,
    ActParticipantSessionStatus,
    AssetRef,
    DraftAsset,
    ModelConfig,
    PromptPreview,
    SavedWorkspaceSnapshot,
    SavedWorkspaceSummary,
    DraftAssetKind,
} from './types'
import type { AssetListItem } from '../shared/asset-contracts'
import type { CompilePromptRequest } from '../shared/chat-contracts'
import { fetchJSON, postJSON, putJSON, patchJSON, deleteJSON } from './api-core'
import { chatApi } from './api-clients/chat'
import { dotApi } from './api-clients/dot'
import { opencodeApi } from './api-clients/opencode'
import { workspaceApi } from './api-clients/workspace'

export { setApiWorkingDirContext } from './api-core'

function hydrateDraft(draft: Omit<DraftAsset, 'saveState'> | DraftAsset): DraftAsset {
    return {
        ...draft,
        saveState: 'saved',
    }
}

export const api = {
    health: () => fetchJSON<{ ok: boolean; project: string }>('/api/health'),

    opencodeHealth: opencodeApi.health,
    opencodeRestart: opencodeApi.restart,
    opencodeApplyRuntimeReload: opencodeApi.applyRuntimeReload,

    assets: {
        list: (kind: string) => fetchJSON<AssetListItem[]>(`/api/assets/${kind}`),
        get: (kind: string, author: string, path: string) => fetchJSON<AssetListItem>(`/api/assets/${kind}/${author}?path=${encodeURIComponent(path)}`),
        getRegistry: (kind: string, author: string, path: string) => fetchJSON<AssetListItem>(`/api/assets/registry/${kind}/${author}?path=${encodeURIComponent(path)}`),
    },

    workspaces: {
        list: (includeHidden = false) => fetchJSON<SavedWorkspaceSummary[]>(`/api/workspaces${includeHidden ? '?includeHidden=1' : ''}`),
        get: (id: string) => fetchJSON<SavedWorkspaceSnapshot>(`/api/workspaces/${id}`),
        save: (data: SavedWorkspaceSnapshot) => putJSON<{ ok: boolean; id: string; workingDir: string; updatedAt: number; hiddenFromList?: boolean }>('/api/workspaces', data),
        setHidden: (id: string, hiddenFromList: boolean) => patchJSON<{ ok: boolean; id: string; hiddenFromList: boolean }>(`/api/workspaces/${id}`, { hiddenFromList }),
        delete: (id: string) => deleteJSON<{ ok: boolean }>(`/api/workspaces/${id}`),
    },

    drafts: {
        list: (kind?: 'tal' | 'dance' | 'performer' | 'act') =>
            fetchJSON<{ drafts: DraftAsset[] }>(`/api/drafts${kind ? `?kind=${kind}` : ''}`).then((response) => response.drafts.map(hydrateDraft)),
        get: (kind: 'tal' | 'dance' | 'performer' | 'act', id: string) =>
            fetchJSON<{ draft: DraftAsset }>(`/api/drafts/${kind}/${id}`).then((response) => hydrateDraft(response.draft)),
        create: (body: { kind: DraftAssetKind; name: string; content: unknown; id?: string; slug?: string; description?: string; tags?: string[]; derivedFrom?: string | null }) =>
            postJSON<{ draft: DraftAsset }>('/api/drafts', body).then((response) => hydrateDraft(response.draft)),
        update: (kind: 'tal' | 'dance' | 'performer' | 'act', id: string, patch: { name?: string; content?: unknown; slug?: string; description?: string; tags?: string[]; derivedFrom?: string | null }) =>
            putJSON<{ draft: DraftAsset }>(`/api/drafts/${kind}/${id}`, patch).then((response) => hydrateDraft(response.draft)),
        delete: (kind: 'tal' | 'dance' | 'performer' | 'act', id: string, cascade = false) =>
            deleteJSON<{ ok: boolean; deletedIds: string[] }>(`/api/drafts/${kind}/${id}`, { cascade }),
        previewDelete: (kind: 'tal' | 'dance' | 'performer' | 'act', id: string) =>
            postJSON<{
                target: { draftId: string; kind: string; name: string; source: string; reason: string }
                dependents: Array<{ draftId: string; kind: string; name: string; source: string; reason: string }>
            }>(`/api/drafts/delete-preview/${kind}/${id}`, {}),
        danceBundle: {
            tree: (id: string) =>
                fetchJSON<{ tree: Array<{ name: string; type: 'file' | 'directory'; path: string; children?: unknown[] }> }>(`/api/drafts/dance/${id}/tree`).then((r) => r.tree),
            readFile: (id: string, filePath: string) =>
                fetchJSON<{ path: string; content: string }>(`/api/drafts/dance/${id}/file?path=${encodeURIComponent(filePath)}`),
            writeFile: (id: string, filePath: string, content: string) =>
                putJSON<{ ok: boolean; path: string }>(`/api/drafts/dance/${id}/file`, { path: filePath, content }),
            createFile: (id: string, filePath: string, isDirectory?: boolean) =>
                postJSON<{ ok: boolean; path: string }>(`/api/drafts/dance/${id}/files`, { path: filePath, isDirectory }),
            deleteFile: (id: string, filePath: string) =>
                deleteJSON<{ ok: boolean; path: string }>(`/api/drafts/dance/${id}/file`, { path: filePath }),
        },
    },

    compile: (
        performerId: string | null,
        performerName: string | null,
        talRef: AssetRef | null,
        danceRefs: AssetRef[],
        model: ModelConfig | null,
        modelVariant: string | null,
        agentId: string | null,
        mcpServerNames: string[],
        planMode = false,
        requestTargets?: Array<{
            performerId: string
            performerName: string
            description?: string
        }>,
    ) =>
        postJSON<PromptPreview>('/api/compile', {
            performerId: performerId || undefined,
            performerName: performerName || undefined,
            talRef,
            danceRefs,
            model,
            modelVariant,
            agentId,
            mcpServerNames,
            planMode,
            requestTargets,
        } satisfies CompilePromptRequest),

    chat: chatApi,

    actRuntime: {
        createThread: (actId: string, actDefinition?: Record<string, unknown>) =>
            postJSON<{
                ok: boolean
                thread: {
                    id: string
                    actId: string
                    name?: string
                    status: ActThreadStatus
                    createdAt: number
                    participantSessions: Record<string, string>
                    participantStatuses: Record<string, ActParticipantSessionStatus>
                }
            }>(
                `/api/act/${actId}/threads`,
                actDefinition ? { actDefinition } : undefined,
            ),
        syncDefinition: (actId: string, actDefinition: Record<string, unknown>) =>
            patchJSON<{
                ok: boolean
                threads: Array<{
                    id: string
                    actId: string
                    name?: string
                    status: ActThreadStatus
                    createdAt: number
                    participantSessions: Record<string, string>
                    participantStatuses: Record<string, ActParticipantSessionStatus>
                }>
            }>(
                `/api/act/${actId}/runtime-definition`,
                { actDefinition },
            ),
        listThreads: (actId: string) =>
            fetchJSON<{
                ok: boolean
                threads: Array<{
                    id: string
                    actId: string
                    name?: string
                    status: ActThreadStatus
                    createdAt: number
                    participantSessions: Record<string, string>
                    participantStatuses: Record<string, ActParticipantSessionStatus>
                }>
            }>(
                `/api/act/${actId}/threads`,
            ),
        renameThread: (actId: string, threadId: string, name: string) =>
            patchJSON<{
                ok: boolean
                thread: {
                    id: string
                    actId: string
                    name?: string
                    status: ActThreadStatus
                    createdAt: number
                    participantSessions: Record<string, string>
                    participantStatuses: Record<string, ActParticipantSessionStatus>
                }
            }>(
                `/api/act/${actId}/thread/${threadId}`,
                { name },
            ),
        getThread: (actId: string, threadId: string) =>
            fetchJSON<{ ok: boolean; thread: Record<string, unknown> }>(`/api/act/${actId}/thread/${threadId}`),
        events: (actId: string, threadId: string, count = 50, before = 0) =>
            fetchJSON<{ ok: boolean; events: Array<Record<string, unknown>>; total: number; hasMore: boolean; nextBefore: number }>(
                `/api/act/${actId}/thread/${threadId}/events?count=${count}&before=${before}`,
            ),
        deleteThread: (actId: string, threadId: string) =>
            deleteJSON<{ ok: boolean }>(`/api/act/${actId}/thread/${threadId}`),
        deleteAct: (actId: string) =>
            deleteJSON<{ ok: boolean }>(`/api/act/${actId}`),
        readBoard: (actId: string, threadId: string, key?: string) =>
            fetchJSON<{ ok: boolean; entries: Array<Record<string, unknown>> }>(
                `/api/act/${actId}/thread/${threadId}/read-board${key ? `?key=${encodeURIComponent(key)}` : ''}`,
            ),
    },

    mcp: opencodeApi.mcp,
    models: opencodeApi.models,
    agents: opencodeApi.agents,
    runtime: opencodeApi.runtime,
    config: opencodeApi.config,
    providers: opencodeApi.providers,
    provider: opencodeApi.provider,
    file: opencodeApi.file,
    find: opencodeApi.find,
    vcs: opencodeApi.vcs,

    workspace: workspaceApi,

    studio: {
        getConfig: () =>
            fetchJSON<{ theme?: string; lastWorkspaceId?: string; openCodeUrl?: string; projectDir?: string }>('/api/studio/config'),
        updateConfig: (config: Record<string, unknown>) => putJSON<unknown>('/api/studio/config', config),
        activate: (workingDir: string) => postJSON<{ ok: boolean; activeProjectDir: string }>('/api/studio/activate', { workingDir }),
        openPath: (targetPath: string) => postJSON<{ ok: boolean; path: string }>('/api/studio/open-path', { path: targetPath }),
        pickDirectory: (prompt?: string) => fetchJSON<{ path?: string; error?: string }>(`/api/studio/pick-directory${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}`),
    },

    dot: dotApi,
}
