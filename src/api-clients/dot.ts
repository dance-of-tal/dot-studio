import type {
    DanceExportRequest,
    DanceExportResponse,
    DotAuthUserResponse,
    DotInitResponse,
    DotInstallRequest,
    DotLoginResponse,
    DotPublishRequest,
    DotSaveLocalRequest,
    DotStatusResponse,
} from '../../shared/dot-contracts'
import type { AssetListItem } from '../../shared/asset-contracts'
import { fetchJSON, postJSON, putJSON, deleteJSON } from '../api-core'

type DotPerformerResponse = Record<string, unknown>
type DotInstallResponse = Record<string, unknown>

export const dotApi = {
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

    performer: (name: string) =>
        fetchJSON<DotPerformerResponse>(`/api/dot/performers/${name}`),

    agents: () =>
        fetchJSON<Record<string, string>>('/api/dot/agents'),

    updateAgents: (manifest: Record<string, string>) =>
        putJSON<{ ok: boolean }>('/api/dot/agents', manifest),

    install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') =>
        postJSON<DotInstallResponse>('/api/dot/install', { urn, localName, force, scope } satisfies DotInstallRequest),

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
        providedAssets?: Array<{
            kind: 'tal' | 'performer' | 'act'
            urn: string
            payload: Record<string, unknown>
            tags?: string[]
        }>,
        acknowledgedTos = false,
    ) =>
        postJSON<{
            ok: boolean
            urn: string
            published: boolean
            dependenciesPublished: string[]
            dependenciesSkipped: string[]
            dependenciesExisting: string[]
        }>('/api/dot/assets/publish', { kind, slug, payload, tags, providedAssets, acknowledgedTos } satisfies DotPublishRequest),

    search: (query: string, kind?: string, limit?: number) =>
        fetchJSON<AssetListItem[]>(
            `/api/dot/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`,
        ),

    validate: (performer: Record<string, unknown>) =>
        postJSON<{ valid: boolean; error?: string }>('/api/dot/validate', performer),

    uninstallAsset: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string, cascade = false) =>
        deleteJSON<{ ok: boolean; urn: string; scope: 'global' | 'stage'; deletedUrns: string[] }>('/api/dot/assets/local', { kind, urn, cascade }),

    previewUninstall: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string) =>
        postJSON<{
            target: { urn: string; kind: string; name: string; source: string; reason: string }
            dependents: Array<{ urn: string; kind: string; name: string; source: string; reason: string }>
        }>('/api/dot/assets/uninstall-preview', { kind, urn }),

    addFromGitHub: (source: string, scope?: 'global' | 'stage') =>
        postJSON<{
            installed: Array<{ urn: string; name: string; description: string }>
            source: string
        }>('/api/dot/add', { source, scope }),

    exportDanceBundle: (draftId: string, slug: string, destinationParentPath: string, overwrite = false) =>
        postJSON<DanceExportResponse>(
            '/api/dot/dance-export',
            { draftId, slug, destinationParentPath, overwrite } satisfies DanceExportRequest,
        ),
}
