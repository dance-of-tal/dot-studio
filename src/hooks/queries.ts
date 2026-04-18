// ── TanStack Query Hooks — Server State ─────────────────
// Replaces manual Zustand loading for all API-sourced data.
// Client state (performers, edges, theme, etc.) remains in Zustand.

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from '../api'
import type { AssetRef } from '../types'
import type { AssetCard, McpServer, ModelConfig, RuntimeToolResolution } from '../types'
import { useStudioStore } from '../store'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import type { GitHubDanceSyncStatus } from '../../shared/asset-contracts'
import type { InstalledDanceLocator } from '../../shared/dot-contracts'

type InstallableAssetKind = 'tal' | 'dance' | 'performer' | 'act'

// ── Query Keys ──────────────────────────────────────────
export const queryKeys = {
    assets: (workingDir: string) => ['assets', workingDir] as const,
    assetKind: (workingDir: string, kind: InstallableAssetKind) => ['assets', workingDir, kind] as const,
    assetInventory: (workingDir: string) => ['asset-inventory', workingDir] as const,
    models: (workingDir: string) => ['models', workingDir] as const,
    agents: ['agents'] as const,
    mcpServers: ['mcp-servers'] as const,
    runtimeTools: (workingDir: string, modelKey: string, serverKey: string) => ['runtime-tools', workingDir, modelKey, serverKey] as const,
    serverHealth: ['server-health'] as const,
    dotStatus: (workingDir: string) => ['dot-status', workingDir] as const,
    dotAuthUser: ['dot-auth-user'] as const,
    registrySearch: (workingDir: string, q: string) => ['registry-search', workingDir, q] as const,
    danceUpdateChecks: (workingDir: string, assetsKey: string, includeRepoDrift: boolean) =>
        ['dance-update-checks', workingDir, assetsKey, includeRepoDrift ? 'drift' : 'light'] as const,
} as const

// ── Assets ──────────────────────────────────────────────
export function useAssetKind(kind: InstallableAssetKind, enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<AssetCard[]>({
        queryKey: queryKeys.assetKind(workingDir, kind),
        queryFn: () => api.assets.list(kind) as Promise<AssetCard[]>,
        enabled,
        staleTime: 30_000,       // consider fresh for 30s
        gcTime: 5 * 60_000,     // keep in cache for 5min
        refetchOnWindowFocus: true,
    })
}

export function useAssets(enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<AssetCard[]>({
        queryKey: queryKeys.assetInventory(workingDir),
        queryFn: async () => {
            const [tals, dances, performers, acts] = await Promise.all([
                api.assets.list('tal'),
                api.assets.list('dance'),
                api.assets.list('performer'),
                api.assets.list('act'),
            ])
            return [...tals, ...dances, ...performers, ...acts] as AssetCard[]
        },
        enabled,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
    })
}

// ── Models ──────────────────────────────────────────────
export function useModels(enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<RuntimeModelCatalogEntry[]>({
        queryKey: queryKeys.models(workingDir),
        queryFn: () => api.models.list(),
        enabled,
        staleTime: 60_000,       // models rarely change
        gcTime: 5 * 60_000,
    })
}

export function useAgents(enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<Array<{
        name: string
        model?: string
        description?: string
        color?: string
        mode?: 'subagent' | 'primary' | 'all'
        hidden?: boolean
        native?: boolean
        variant?: string
    }>>({
        queryKey: [...queryKeys.agents, workingDir],
        queryFn: () => api.agents.list(),
        enabled,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    })
}

// ── MCP Servers ─────────────────────────────────────────
export function useMcpServers(enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<McpServer[]>({
        queryKey: [...queryKeys.mcpServers, workingDir],
        queryFn: () => api.mcp.list(),
        enabled,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    })
}

export function useRuntimeTools(model: ModelConfig | null, mcpServerNames: string[], enabled = true) {
    const workingDir = useStudioStore((s) => s.workingDir)
    const modelKey = model ? `${model.provider}:${model.modelId}` : 'none'
    const serverKey = [...mcpServerNames].sort().join(',')
    return useQuery<RuntimeToolResolution>({
        queryKey: queryKeys.runtimeTools(workingDir, modelKey, serverKey),
        queryFn: () => api.runtime.resolveTools({ model, mcpServerNames }),
        enabled: enabled && mcpServerNames.length > 0,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
    })
}

// ── Server Health ───────────────────────────────────────
export function useServerHealth() {
    return useQuery({
        queryKey: queryKeys.serverHealth,
        queryFn: async () => {
            await api.opencodeHealth()
            return true
        },
        retry: 2,
        staleTime: 30_000,
    })
}

// ── DOT Status ──────────────────────────────────────────
export function useDotStatus() {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery<{ initialized: boolean; dotDir: string; projectDir: string }>({
        queryKey: queryKeys.dotStatus(workingDir),
        queryFn: () => api.dot.status(),
        staleTime: 60_000,
    })
}

export function useDotAuthUser() {
    return useQuery<{ authenticated: boolean; username: string | null }>({
        queryKey: queryKeys.dotAuthUser,
        queryFn: () => api.dot.authUser(),
        staleTime: 60_000,
        retry: false,
        placeholderData: keepPreviousData,
    })
}

// ── Registry Search ─────────────────────────────────────
export function useRegistrySearch(
    query: string,
    kind: 'all' | 'tal' | 'dance' | 'performer' | 'act' = 'all',
    enabled = false,
) {
    const workingDir = useStudioStore((s) => s.workingDir)
    return useQuery({
        queryKey: queryKeys.registrySearch(workingDir, `${kind}:${query}`),
        queryFn: () => api.dot.search(query, kind === 'all' ? undefined : kind, 20),
        enabled: enabled && query.trim().length > 0,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    })
}

export function useDanceUpdateChecks(
    assets: InstalledDanceLocator[],
    includeRepoDrift = false,
    enabled = true,
) {
    const workingDir = useStudioStore((s) => s.workingDir)
    const assetsKey = assets
        .map((asset) => `${asset.scope}:${asset.urn}`)
        .sort()
        .join('|')

    return useQuery<Array<InstalledDanceLocator & { sync: GitHubDanceSyncStatus }>>({
        queryKey: queryKeys.danceUpdateChecks(workingDir, assetsKey, includeRepoDrift),
        queryFn: async () => {
            const response = await api.dot.checkDanceUpdates({ assets, includeRepoDrift })
            return response.results
        },
        enabled: enabled && assets.length > 0,
        staleTime: 5 * 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
    })
}

// ── Mutations ───────────────────────────────────────────

export function useInstallAsset() {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((s) => s.workingDir)
    return useMutation({
        mutationFn: ({ urn, localName, scope }: { urn: string; localName?: string; scope?: 'global' | 'stage' }) =>
            api.dot.install(urn, localName, undefined, scope),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.dotStatus(workingDir) })
        },
    })
}

export function useAddDance() {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((s) => s.workingDir)
    return useMutation({
        mutationFn: ({ source, scope }: { source: string; scope?: 'global' | 'stage' }) => api.dot.addFromGitHub(source, scope),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.dotStatus(workingDir) })
        },
    })
}

export function useApplyDanceUpdates() {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((s) => s.workingDir)
    return useMutation({
        mutationFn: (assets: InstalledDanceLocator[]) => api.dot.applyDanceUpdates({ assets }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) })
            queryClient.invalidateQueries({ queryKey: ['dance-update-checks', workingDir] })
        },
    })
}

export function useReimportDanceSource() {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((s) => s.workingDir)
    return useMutation({
        mutationFn: (asset: InstalledDanceLocator) => api.dot.reimportDanceSource(asset),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) })
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) })
            queryClient.invalidateQueries({ queryKey: ['dance-update-checks', workingDir] })
        },
    })
}

export function useCompilePrompt() {
    return useMutation({
        mutationFn: ({
            performerId,
            performerName,
            talRef,
            danceRefs,
            model,
            modelVariant,
            agentId,
            mcpServerNames,
            planMode,
            requestTargets,
        }: {
            performerId: string | null
            performerName: string | null
            talRef: AssetRef | null
            danceRefs: AssetRef[]
            model: { provider: string; modelId: string } | null
            modelVariant: string | null
            agentId: string | null
            mcpServerNames: string[]
            planMode?: boolean
            requestTargets?: Array<{ performerId: string; performerName: string }>
        }) => api.compile(performerId, performerName, talRef, danceRefs, model, modelVariant, agentId, mcpServerNames, planMode || false, requestTargets),
    })
}
