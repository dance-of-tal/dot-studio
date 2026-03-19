import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import { showToast } from '../../lib/toast'
import { slugifyAssetName } from '../../lib/performers'
import type { AssetCard } from '../../types'
import {
    useAssetKind,
    useAssets,
    useDotAuthUser,
    useInstallAsset,
    useModels,
    queryKeys,
    useRegistrySearch,
} from '../../hooks/queries'
import { useMcpCatalog } from './useMcpCatalog'
import type {
    AssetScope,
    InstalledKind,
    LocalSection,
    ModelProviderFilter,
    RegistryKind,
    RuntimeKind,
    SourceFilter,
} from './asset-library-utils'
import {
    buildAuthoringPayloadFromAsset,
    buildDraftAssetCards,
    buildMcpHaystack,
    buildRegistryGroups,
    filterInstalledAssets,
    getAssetSelectionKey,
    getAssetUrn,
    groupModels,
    isInstalledAssetKind,
    placeholderForLocalSection,
} from './asset-library-utils'

export function useAssetLibraryController() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const drafts = useStudioStore((state) => state.drafts)
    const addPerformer = useStudioStore((state) => state.addPerformer)
    const createMarkdownEditor = useStudioStore((state) => state.createMarkdownEditor)
    const selectPerformer = useStudioStore((state) => state.selectPerformer)
    const setActiveChatPerformer = useStudioStore((state) => state.setActiveChatPerformer)

    const [filter, setFilter] = useState('')
    const [scope, setScope] = useState<AssetScope>('local')
    const [localSection, setLocalSection] = useState<LocalSection>('installed')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [installedKind, setInstalledKind] = useState<InstalledKind>('performer')
    const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>('models')
    const [registryKind, setRegistryKind] = useState<RegistryKind>('all')
    const [modelProviderFilter, setModelProviderFilter] = useState<ModelProviderFilter>('all')

    const [registryQuery, setRegistryQuery] = useState('')
    const [searchEnabled, setSearchEnabled] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<any | null>(null)
    const [expandedModelProviders, setExpandedModelProviders] = useState<Record<string, boolean>>({})
    const [expandedMcpEntries, setExpandedMcpEntries] = useState<Record<string, boolean>>({})
    const [showMcpRawConfig, setShowMcpRawConfig] = useState(false)
    const [authoringHint, setAuthoringHint] = useState<string | null>(null)
    const [detailActionStatus, setDetailActionStatus] = useState<string | null>(null)
    const [detailActionLoading, setDetailActionLoading] = useState<null | 'save-local' | 'publish' | 'import'>(null)

    const { data: authUser } = useDotAuthUser()
    const queryClient = useQueryClient()

    const showInstalledAssets = scope === 'local' && localSection === 'installed'
    const showModels = scope === 'local' && localSection === 'runtime' && runtimeKind === 'models'
    const showMcps = scope === 'local' && localSection === 'runtime' && runtimeKind === 'mcps'

    const { data: installedAssets = [], isLoading: assetsLoading } = useAssetKind(installedKind, showInstalledAssets)
    const { data: assetInventory = [] } = useAssets(scope === 'registry')
    const { data: models = [] } = useModels(showModels)
    const { data: registryResults = [], isLoading: registryLoading, error: registryError } = useRegistrySearch(
        registryQuery,
        registryKind,
        searchEnabled,
    )

    const mcp = useMcpCatalog(workingDir, showMcps)
    const mcpServers = mcp.mcpServers ?? []
    const {
        mcpDraftEntries,
        mcpCatalogDirty,
        mcpCatalogStatus,
        mcpCatalogSaving,
        pendingMcpAuthName,
        updateMcpEntry,
        addMcpEntry,
        removeMcpEntry,
        saveMcpCatalog,
        resetMcpCatalog,
        connectMcpServer,
        disconnectMcpServer,
        authenticateMcpServer,
        clearMcpAuth,
    } = mcp

    const draftAssetCards = useMemo<AssetCard[]>(
        () => buildDraftAssetCards(drafts, installedKind),
        [drafts, installedKind],
    )

    const visibleInstalledAssets = useMemo(
        () => [...draftAssetCards, ...installedAssets],
        [draftAssetCards, installedAssets],
    )

    const installMutation = useInstallAsset()

    useEffect(() => {
        setSelectedAsset(null)
    }, [scope, localSection, installedKind, runtimeKind, registryKind])

    useEffect(() => {
        setAuthoringHint(null)
    }, [scope, localSection, installedKind])

    useEffect(() => {
        setExpandedModelProviders({})
    }, [filter, modelProviderFilter])

    const installedUrns = useMemo(
        () => new Set(assetInventory.map((asset) => getAssetUrn(asset)).filter(Boolean) as string[]),
        [assetInventory],
    )

    const triggerSearch = () => {
        if (registryQuery.trim()) {
            setSearchEnabled(true)
        }
    }

    const handleQueryChange = (value: string) => {
        setRegistryQuery(value)
        setSearchEnabled(false)
    }

    const handleRegistryInstall = async (urn: string, targetScope: 'global' | 'stage') => {
        return installMutation.mutateAsync({ urn, scope: targetScope })
    }

    const createNewPerformerDraftEntry = (kind: 'tal' | 'dance') => {
        createMarkdownEditor(kind)
        setAuthoringHint(`Opened a new ${kind} editor on the canvas.`)
    }

    const createNewPerformer = () => {
        const beforeIds = new Set(performers.map((performer) => performer.id))
        addPerformer(`Performer ${performers.filter((performer) => performer.scope === 'shared').length + 1}`, 80, 80)
        const created = useStudioStore.getState().performers.find((performer) => !beforeIds.has(performer.id))
        if (created) {
            selectPerformer(created.id)
            setActiveChatPerformer(created.id)
            setAuthoringHint(`Created ${created.name}. Configure and publish it from the inspector.`)
        }
    }

    const invalidateInstalledAssetQueries = async (kind: InstalledKind) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }

    const handlePinnedAssetAction = async (asset: any, action: 'save-local' | 'publish') => {
        if (!asset || !isInstalledAssetKind(asset.kind)) return

        try {
            setDetailActionLoading(action)
            setDetailActionStatus(null)
            const payload = buildAuthoringPayloadFromAsset(asset)
            const targetSlug = asset.slug || slugifyAssetName(asset.name)

            if (action === 'save-local') {
                if (!authUser?.username) {
                    throw new Error('Run dot login first to save a local fork under your namespace.')
                }
                const result = await api.dot.saveLocalAsset(asset.kind, targetSlug, payload, authUser.username)
                await invalidateInstalledAssetQueries(asset.kind)

                if (asset.source === 'draft' && asset.draftId) {
                    api.drafts.delete(asset.kind, asset.draftId).catch(() => {})
                    useStudioStore.setState((state) => {
                        const next = { ...state.drafts }
                        delete next[asset.draftId]
                        return { drafts: next }
                    })
                }

                setDetailActionStatus(result.existed
                    ? `Updated local ${asset.kind} asset at ${result.urn}.`
                    : `Saved local ${asset.kind} asset at ${result.urn}.`)
                return
            }

            const result = await api.dot.publishAsset(asset.kind, targetSlug, payload, Array.isArray(asset.tags) ? asset.tags : [], true)
            await invalidateInstalledAssetQueries(asset.kind)
            setDetailActionStatus(result.published
                ? `Published ${result.urn}.`
                : `${result.urn} already exists in the registry.`)
        } catch (error: any) {
            setDetailActionStatus(error?.message || 'Asset action failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handleDeleteDraft = async (asset: any) => {
        if (!asset?.draftId || !asset?.kind) return
        try {
            await api.drafts.delete(asset.kind, asset.draftId)
            useStudioStore.setState((state) => {
                const next = { ...state.drafts }
                delete next[asset.draftId]
                return { drafts: next }
            })
            setSelectedAsset(null)
            showToast(`Deleted draft "${asset.name}"`, 'success', {
                title: 'Draft deleted',
                dedupeKey: `draft:delete:${asset.draftId}`,
            })
        } catch (error: any) {
            showToast(error?.message || 'Failed to delete draft', 'error', {
                title: 'Delete failed',
                dedupeKey: `draft:delete-error:${asset.draftId}`,
            })
        }
    }

    const queryText = filter.trim().toLowerCase()
    const filteredInstalledAssets = useMemo(
        () => filterInstalledAssets(visibleInstalledAssets, sourceFilter, queryText),
        [visibleInstalledAssets, queryText, sourceFilter],
    )
    const groupedModels = useMemo(
        () => groupModels(models, queryText, modelProviderFilter),
        [modelProviderFilter, models, queryText],
    )
    const filteredMcps = useMemo(
        () => mcpServers.filter((mcpServer) => !queryText || buildMcpHaystack(mcpServer).includes(queryText)),
        [mcpServers, queryText],
    )
    const registryGroups = useMemo(
        () => buildRegistryGroups(registryResults as Array<any>),
        [registryResults],
    )

    const selectedAssetKey = selectedAsset ? getAssetSelectionKey(selectedAsset) : null
    useEffect(() => {
        setDetailActionStatus(null)
        setDetailActionLoading(null)
    }, [selectedAssetKey])

    const selectedInstalled = useMemo(() => {
        if (!selectedAsset) return false
        if (selectedAsset.source && selectedAsset.urn) return true
        const urn = getAssetUrn(selectedAsset)
        return urn ? installedUrns.has(urn) : false
    }, [installedUrns, selectedAsset])

    const modelProviderTabs: Array<{ key: ModelProviderFilter; label: string }> = [
        { key: 'all', label: 'All' },
        { key: 'anthropic', label: 'Anthropic' },
        { key: 'openai', label: 'OpenAI' },
        { key: 'google', label: 'Google' },
        { key: 'xai', label: 'xAI/Grok' },
        { key: 'other', label: 'Other' },
    ]

    const localPlaceholder = placeholderForLocalSection(localSection, runtimeKind)

    return {
        scope,
        setScope,
        localSection,
        setLocalSection,
        installedKind,
        setInstalledKind,
        runtimeKind,
        setRuntimeKind,
        sourceFilter,
        setSourceFilter,
        modelProviderFilter,
        setModelProviderFilter,
        filter,
        setFilter,
        localPlaceholder,
        authoringHint,
        assetsLoading,
        filteredInstalledAssets,
        groupedModels,
        filteredMcps,
        selectedAsset,
        setSelectedAsset,
        selectedAssetKey,
        selectedInstalled,
        authUser,
        detailActionStatus,
        detailActionLoading,
        createNewPerformer,
        createNewPerformerDraftEntry,
        showInstalledAssets,
        showModels,
        showMcps,
        mcpDraftEntries,
        mcpCatalogDirty,
        mcpCatalogStatus,
        mcpCatalogSaving,
        pendingMcpAuthName,
        updateMcpEntry,
        addMcpEntry,
        removeMcpEntry,
        saveMcpCatalog,
        resetMcpCatalog,
        connectMcpServer,
        disconnectMcpServer,
        authenticateMcpServer,
        clearMcpAuth,
        showMcpRawConfig,
        setShowMcpRawConfig,
        expandedMcpEntries,
        setExpandedMcpEntries,
        expandedModelProviders,
        setExpandedModelProviders,
        modelProviderTabs,
        registryQuery,
        registryLoading,
        registryResults,
        registryError,
        registryKind,
        setRegistryKind,
        registryGroups,
        installedUrns,
        triggerSearch,
        handleQueryChange,
        handleRegistryInstall,
        handlePinnedAssetAction,
        handleDeleteDraft,
        setSearchEnabled,
    }
}
