// DOT Studio — API Client

import type {
    AssetRef,
    DanceDeliveryMode,
    DraftAsset,
    ModelConfig,
    PromptPreview,
    SavedStageSummary,
    DraftAssetKind,
} from './types'
import type { AssetListItem } from '../shared/asset-contracts'
import type { CompilePromptRequest } from '../shared/chat-contracts'
import type { SafeOwnerKind, SafeOwnerSummary } from '../shared/safe-mode'
import { fetchJSON, postJSON, putJSON, patchJSON, deleteJSON } from './api-core'
import { chatApi } from './api-clients/chat'
import { dotApi } from './api-clients/dot'
import { opencodeApi } from './api-clients/opencode'
import { workspaceApi } from './api-clients/workspace'

export { setApiWorkingDirContext } from './api-core'

export const api = {
    health: () => fetchJSON<{ ok: boolean; project: string }>('/api/health'),

    opencodeHealth: opencodeApi.health,
    opencodeRestart: opencodeApi.restart,

    assets: {
        list: (kind: string) => fetchJSON<AssetListItem[]>(`/api/assets/${kind}`),
        get: (kind: string, author: string, name: string) => fetchJSON<AssetListItem>(`/api/assets/${kind}/${author}/${name}`),
        getRegistry: (kind: string, author: string, name: string) => fetchJSON<AssetListItem>(`/api/assets/registry/${kind}/${author}/${name}`),
    },

    stages: {
        list: (includeHidden = false) => fetchJSON<SavedStageSummary[]>(`/api/stages${includeHidden ? '?includeHidden=1' : ''}`),
        get: (id: string) => fetchJSON<any>(`/api/stages/${id}`),
        save: (data: any) => putJSON<{ ok: boolean; id: string; workingDir: string; updatedAt: number }>('/api/stages', data),
        setHidden: (id: string, hiddenFromList: boolean) => patchJSON<{ ok: boolean; id: string; hiddenFromList: boolean }>(`/api/stages/${id}`, { hiddenFromList }),
        delete: (id: string) => deleteJSON<{ ok: boolean }>(`/api/stages/${id}`),
    },

    drafts: {
        list: (kind?: DraftAssetKind) =>
            fetchJSON<{ drafts: DraftAsset[] }>(`/api/drafts${kind ? `?kind=${kind}` : ''}`).then((response) => response.drafts),
        get: (kind: DraftAssetKind, id: string) =>
            fetchJSON<{ draft: DraftAsset }>(`/api/drafts/${kind}/${id}`).then((response) => response.draft),
        create: (body: { kind: DraftAssetKind; name: string; content: unknown; id?: string; slug?: string; description?: string; tags?: string[]; derivedFrom?: string | null }) =>
            postJSON<{ draft: DraftAsset }>('/api/drafts', body).then((response) => response.draft),
        update: (kind: DraftAssetKind, id: string, patch: { name?: string; content?: unknown; slug?: string; description?: string; tags?: string[]; derivedFrom?: string | null }) =>
            putJSON<{ draft: DraftAsset }>(`/api/drafts/${kind}/${id}`, patch).then((response) => response.draft),
        delete: (kind: DraftAssetKind, id: string) =>
            deleteJSON<{ ok: boolean }>(`/api/drafts/${kind}/${id}`),
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
        danceDeliveryMode: DanceDeliveryMode = 'auto',
        relatedPerformers?: Array<{
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
            danceDeliveryMode,
            relatedPerformers,
        } satisfies CompilePromptRequest),

    chat: chatApi,

    actRuntime: {
        createThread: (actId: string, actDefinition?: any) =>
            postJSON<{ ok: boolean; thread: { id: string; actId: string; status: string; createdAt: number } }>(
                `/api/act/${actId}/threads`,
                actDefinition ? { actDefinition } : undefined,
            ),
        listThreads: (actId: string) =>
            fetchJSON<{ ok: boolean; threads: Array<{ id: string; actId: string; status: string; createdAt: number; participantSessions: Record<string, string> }> }>(
                `/api/act/${actId}/threads`,
            ),
        getThread: (actId: string, threadId: string) =>
            fetchJSON<{ ok: boolean; thread: any }>(`/api/act/${actId}/thread/${threadId}`),
        events: (actId: string, threadId: string, count = 50) =>
            fetchJSON<{ ok: boolean; events: any[] }>(`/api/act/${actId}/thread/${threadId}/events?count=${count}`),
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

    lsp: opencodeApi.lsp,
    mcp: opencodeApi.mcp,
    models: opencodeApi.models,
    agents: opencodeApi.agents,
    tools: opencodeApi.tools,
    runtime: opencodeApi.runtime,
    adapter: opencodeApi.adapter,
    config: opencodeApi.config,
    providers: opencodeApi.providers,
    provider: opencodeApi.provider,
    file: opencodeApi.file,
    find: opencodeApi.find,
    vcs: opencodeApi.vcs,

    workspace: workspaceApi,

    studio: {
        getConfig: () =>
            fetchJSON<{ theme?: string; lastStage?: string; openCodeUrl?: string; projectDir?: string }>('/api/studio/config'),
        updateConfig: (config: Record<string, any>) => putJSON<any>('/api/studio/config', config),
        activate: (workingDir: string) => postJSON<{ ok: boolean; activeProjectDir: string }>('/api/studio/activate', { workingDir }),
        pickDirectory: () => fetchJSON<{ path?: string; error?: string }>('/api/studio/pick-directory'),
    },

    dot: dotApi,
}
