import type { DotAuthUserResponse, DotInitResponse, DotInstallRequest, DotLoginResponse, DotPublishRequest, DotSaveLocalRequest, DotStatusResponse } from '../../shared/dot-contracts'
import { deleteJSON, fetchJSON, postJSON, putJSON } from '../api-core'

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
            `/api/dot/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`,
        ),

    validate: (performer: any) =>
        postJSON<{ valid: boolean; error?: string }>('/api/dot/validate', performer),
}
