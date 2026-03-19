import { useEffect, useMemo, useState } from 'react';
import {
    X,
} from 'lucide-react';
import {
    useAssetKind,
    useAssets,
    useDotAuthUser,
    useModels,
    useRegistrySearch,
} from '../../hooks/queries';
import './AssetLibrary.css';
import { useStudioStore } from '../../store';


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
    getAssetUrn,
    buildMcpHaystack,
    buildDraftAssetCards,
    filterInstalledAssets,
    groupModels,
    buildRegistryGroups,
    placeholderForLocalSection,
} from './asset-library-utils';
import { useAssetLibraryActions } from './useAssetLibraryActions';
import AssetLibraryLocalView from './AssetLibraryLocalView';
import AssetLibraryRegistryView from './AssetLibraryRegistryView';

function getAssetSelectionKey(asset: any): string {
    return asset?.draftId || asset?.urn || asset?.name || ''
}

export default function AssetLibrary({ onClose }: { onClose?: () => void }) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const drafts = useStudioStore((state) => state.drafts)
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
        handleRegistryInstall,
        createNewPerformerDraftEntry,
        createNewPerformer,
        handlePinnedAssetAction,
        handleDeleteDraft,
    } = useAssetLibraryActions(workingDir)

    const draftAssetCards = useMemo<AssetCard[]>(
        () => buildDraftAssetCards(drafts, installedKind),
        [drafts, installedKind],
    )

    const visibleInstalledAssets = useMemo(
        () => [...draftAssetCards, ...installedAssets],
        [draftAssetCards, installedAssets],
    )

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
        () => mcpServers.filter((m) => !queryText || buildMcpHaystack(m).includes(queryText)),
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
                    Local
                </button>
                <button
                    className={`scope-btn ${scope === 'registry' ? 'active' : ''}`}
                    onClick={() => setScope('registry')}
                >
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
                    onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local', authUser, setDetailActionLoading, setDetailActionStatus)}
                    onPublish={(asset) => handlePinnedAssetAction(asset, 'publish', authUser, setDetailActionLoading, setDetailActionStatus)}
                    onDeleteDraft={(asset) => handleDeleteDraft(asset, setSelectedAsset)}
                    createNewPerformer={() => createNewPerformer(setAuthoringHint)}
                    createNewPerformerDraftEntry={(kind) => createNewPerformerDraftEntry(kind, setAuthoringHint)}
                    showInstalledAssets={showInstalledAssets}
                    showModels={showModels}
                    showMcps={showMcps}
                    mcpDraftEntries={mcp.mcpDraftEntries}
                    mcpCatalogDirty={mcp.mcpCatalogDirty}
                    mcpCatalogStatus={mcp.mcpCatalogStatus}
                    mcpCatalogSaving={mcp.mcpCatalogSaving}
                    pendingMcpAuthName={mcp.pendingMcpAuthName}
                    updateMcpEntry={mcp.updateMcpEntry}
                    addMcpEntry={mcp.addMcpEntry}
                    removeMcpEntry={mcp.removeMcpEntry}
                    saveMcpCatalog={mcp.saveMcpCatalog}
                    resetMcpCatalog={mcp.resetMcpCatalog}
                    connectMcpServer={mcp.connectMcpServer}
                    disconnectMcpServer={mcp.disconnectMcpServer}
                    authenticateMcpServer={mcp.authenticateMcpServer}
                    clearMcpAuth={mcp.clearMcpAuth}
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
                    onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local', authUser, setDetailActionLoading, setDetailActionStatus)}
                    onPublish={(asset) => handlePinnedAssetAction(asset, 'publish', authUser, setDetailActionLoading, setDetailActionStatus)}
                    onDeleteDraft={(asset) => handleDeleteDraft(asset, setSelectedAsset)}
                />
            )}
        </div>
    )
}
