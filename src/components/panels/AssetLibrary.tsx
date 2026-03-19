import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    X,
} from 'lucide-react';
import { api } from '../../api';
import {
    useAssetKind,
    useAssets,
    useDotAuthUser,
    useModels,
    queryKeys,
    useRegistrySearch,
    useInstallAsset,
} from '../../hooks/queries';
import './AssetLibrary.css';
import { useStudioStore } from '../../store';
import { showToast } from '../../lib/toast';


import { slugifyAssetName } from '../../lib/performers';
import type { AssetCard } from '../../types';
import { useMcpCatalog } from './useMcpCatalog';

import type {
    InstalledKind,
    RuntimeKind,
    AssetScope,
    SourceFilter,
    LocalSection,
    RegistryKind,
    ModelProviderFilter,
} from './asset-library-utils';
import {
    isInstalledAssetKind,
    getAssetUrn,
    buildMcpHaystack,
    buildDraftAssetCards,
    filterInstalledAssets,
    groupModels,
    buildRegistryGroups,
    buildAuthoringPayloadFromAsset,
    placeholderForLocalSection,
} from './asset-library-utils';
import AssetLibraryLocalView from './AssetLibraryLocalView';
import AssetLibraryRegistryView from './AssetLibraryRegistryView';

export default function AssetLibrary({ onClose }: { onClose?: () => void }) {
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

    // MCP catalog state & operations (extracted to useMcpCatalog hook)
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
        if (!asset || !isInstalledAssetKind(asset.kind)) {
            return
        }

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

                // Draft promotion: delete draft from disk after successful save
                if (asset.source === 'draft' && asset.draftId) {
                    api.drafts.delete(asset.kind, asset.draftId).catch(() => {})
                    useStudioStore.setState((s) => {
                        const next = { ...s.drafts }
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
        } catch (err: any) {
            setDetailActionStatus(err?.message || 'Asset action failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handleDeleteDraft = async (asset: any) => {
        if (!asset?.draftId || !asset?.kind) return
        try {
            await api.drafts.delete(asset.kind, asset.draftId)
            // Remove from Zustand store
            useStudioStore.setState((s) => {
                const next = { ...s.drafts }
                delete next[asset.draftId]
                return { drafts: next }
            })
            setSelectedAsset(null)
            showToast(`Deleted draft "${asset.name}"`, 'success', {
                title: 'Draft deleted',
                dedupeKey: `draft:delete:${asset.draftId}`,
            })
        } catch (err: any) {
            showToast(err?.message || 'Failed to delete draft', 'error', {
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
        () => mcpServers.filter((mcp) => !queryText || buildMcpHaystack(mcp).includes(queryText)),
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

    return (
        <div className="assets-panel">
            <div className="drawer-header">
                <span className="drawer-header__title">Asset Library</span>
                {onClose && (
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="scope-selector">
                <button
                    className={`scope-btn ${scope === 'local' ? 'active' : ''}`}
                    onClick={() => setScope('local')}
                >
                    <HardDrive size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Local
                </button>
                <button
                    className={`scope-btn ${scope === 'registry' ? 'active' : ''}`}
                    onClick={() => setScope('registry')}
                >
                    <Globe size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Registry
                </button>
            </div>

            {scope === 'local' ? (
                <AssetLibraryLocalView
                    scope={scope}
                    localSection={localSection}
                    setLocalSection={setLocalSection}
                    installedKind={installedKind}
                    setInstalledKind={setInstalledKind}
                    runtimeKind={runtimeKind}
                    setRuntimeKind={setRuntimeKind}
                    sourceFilter={sourceFilter}
                    setSourceFilter={setSourceFilter}
                    modelProviderFilter={modelProviderFilter}
                    setModelProviderFilter={setModelProviderFilter}
                    filter={filter}
                    setFilter={setFilter}
                    localPlaceholder={localPlaceholder}
                    authoringHint={authoringHint}
                    assetsLoading={assetsLoading}
                    filteredInstalledAssets={filteredInstalledAssets}
                    groupedModels={groupedModels}
                    filteredMcps={filteredMcps}
                    selectedAsset={selectedAsset}
                    selectedAssetKey={selectedAssetKey}
                    selectedInstalled={selectedInstalled}
                    authUser={authUser}
                    detailActionStatus={detailActionStatus}
                    detailActionLoading={detailActionLoading}
                    onSelectAsset={setSelectedAsset}
                    onCloseAsset={() => setSelectedAsset(null)}
                    onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local')}
                    onPublish={(asset) => handlePinnedAssetAction(asset, 'publish')}
                    onDeleteDraft={handleDeleteDraft}
                    createNewPerformer={createNewPerformer}
                    createNewPerformerDraftEntry={createNewPerformerDraftEntry}
                    showInstalledAssets={showInstalledAssets}
                    showModels={showModels}
                    showMcps={showMcps}
                    mcpDraftEntries={mcpDraftEntries}
                    mcpCatalogDirty={mcpCatalogDirty}
                    mcpCatalogStatus={mcpCatalogStatus}
                    mcpCatalogSaving={mcpCatalogSaving}
                    pendingMcpAuthName={pendingMcpAuthName}
                    updateMcpEntry={updateMcpEntry}
                    addMcpEntry={addMcpEntry}
                    removeMcpEntry={removeMcpEntry}
                    saveMcpCatalog={saveMcpCatalog}
                    resetMcpCatalog={resetMcpCatalog}
                    connectMcpServer={connectMcpServer}
                    disconnectMcpServer={disconnectMcpServer}
                    authenticateMcpServer={authenticateMcpServer}
                    clearMcpAuth={clearMcpAuth}
                    showMcpRawConfig={showMcpRawConfig}
                    setShowMcpRawConfig={setShowMcpRawConfig}
                    expandedMcpEntries={expandedMcpEntries}
                    setExpandedMcpEntries={setExpandedMcpEntries}
                    expandedModelProviders={expandedModelProviders}
                    setExpandedModelProviders={setExpandedModelProviders}
                    modelProviderTabs={modelProviderTabs}
                />
            ) : (
                <AssetLibraryRegistryView
                    registryQuery={registryQuery}
                    setRegistryQuery={(value) => {
                        handleQueryChange(value)
                    }}
                    triggerSearch={triggerSearch}
                    registryLoading={registryLoading}
                    registryResults={registryResults}
                    registryError={registryError}
                    registryKind={registryKind}
                    setRegistryKind={(value) => {
                        setRegistryKind(value)
                        setSearchEnabled(false)
                    }}
                    registryGroups={registryGroups}
                    installedUrns={installedUrns}
                    selectedAsset={selectedAsset}
                    selectedAssetKey={selectedAssetKey}
                    selectedInstalled={selectedInstalled}
                    authUser={authUser}
                    detailActionStatus={detailActionStatus}
                    detailActionLoading={detailActionLoading}
                    onSelectAsset={setSelectedAsset}
                    onInstall={handleRegistryInstall}
                    onCloseAsset={() => setSelectedAsset(null)}
                    onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local')}
                    onPublish={(asset) => handlePinnedAssetAction(asset, 'publish')}
                    onDeleteDraft={handleDeleteDraft}
                />
            )}
        </div>
    )
}
