import type { ReactNode } from 'react'
import { Cpu, FolderOpen, HardDrive, Hexagon, Plus, Search, Server, Users, Zap } from 'lucide-react'
import type {
    AssetScope,
    InstalledKind,
    LocalSection,
    ModelProviderFilter,
    RuntimeKind,
    SourceFilter,
} from './asset-library-utils'
import { authoringNoteForInstalledKind, labelForInstalledKind } from './asset-library-utils'
import AssetLibraryMcpManager from './AssetLibraryMcpManager'
import AssetLibraryModelList from './AssetLibraryModelList'

type Props = {
    scope: AssetScope
    localSection: LocalSection
    setLocalSection: (value: LocalSection) => void
    installedKind: InstalledKind
    setInstalledKind: (value: InstalledKind) => void
    runtimeKind: RuntimeKind
    setRuntimeKind: (value: RuntimeKind) => void
    sourceFilter: SourceFilter
    setSourceFilter: (value: SourceFilter) => void
    modelProviderFilter: ModelProviderFilter
    setModelProviderFilter: (value: ModelProviderFilter) => void
    filter: string
    setFilter: (value: string) => void
    localPlaceholder: string
    authoringHint: string | null
    assetsLoading: boolean
    filteredInstalledAssets: any[]
    groupedModels: Array<{ key: string; label: string; items: any[]; connected?: boolean }>
    filteredMcps: any[]
    selectedAsset: any
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser: any
    detailActionStatus: string | null
    detailActionLoading: null | 'save-local' | 'publish' | 'import'
    onSelectAsset: (asset: any) => void
    onCloseAsset: () => void
    onSaveLocal: (asset: any) => void | Promise<void>
    onPublish: (asset: any) => void | Promise<void>
    onDeleteDraft: (asset: any) => void | Promise<void>
    createNewPerformer: () => void
    createNewPerformerDraftEntry: (kind: 'tal' | 'dance') => void
    showInstalledAssets: boolean
    showModels: boolean
    showMcps: boolean
    mcpDraftEntries: any[]
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    updateMcpEntry: (key: string, updater: (current: any) => any) => void
    addMcpEntry: () => void
    removeMcpEntry: (key: string) => void
    saveMcpCatalog: () => Promise<void>
    resetMcpCatalog: () => void
    connectMcpServer: (name: string) => Promise<void>
    disconnectMcpServer: (name: string) => Promise<void>
    authenticateMcpServer: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
    showMcpRawConfig: boolean
    setShowMcpRawConfig: (value: boolean | ((prev: boolean) => boolean)) => void
    expandedMcpEntries: Record<string, boolean>
    setExpandedMcpEntries: (value: any) => void
    expandedModelProviders: Record<string, boolean>
    setExpandedModelProviders: (value: any) => void
    modelProviderTabs: Array<{ key: ModelProviderFilter; label: string }>
}

export default function AssetLibraryLocalView({
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
    selectedAssetKey,
    selectedInstalled,
    authUser,
    detailActionStatus,
    detailActionLoading,
    onSelectAsset,
    onCloseAsset,
    onSaveLocal,
    onPublish,
    onDeleteDraft,
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
}: Props) {
    const installedTabs: Array<{ key: InstalledKind; label: string; icon: React.ReactNode }> = [
        { key: 'performer', label: 'Performer', icon: <Users size={10} /> },
        { key: 'tal', label: 'Tal', icon: <Hexagon size={10} /> },
        { key: 'dance', label: 'Dance', icon: <Zap size={10} /> },
        { key: 'act', label: 'Act', icon: <Zap size={10} /> },
    ]

    const runtimeTabs: Array<{ key: RuntimeKind; label: string; icon: ReactNode }> = [
        { key: 'models', label: 'Models', icon: <Cpu size={10} /> },
        { key: 'mcps', label: 'MCPs', icon: <Server size={10} /> },
    ]

    const installedEmptyMessage = `No ${labelForInstalledKind(installedKind).toLowerCase()} assets found.`

    return (
        <>
            <div className="scope-selector asset-scope-selector">
                <button className={`scope-btn ${localSection === 'installed' ? 'active' : ''}`} onClick={() => setLocalSection('installed')}>
                    Installed Assets
                </button>
                <button className={`scope-btn ${localSection === 'runtime' ? 'active' : ''}`} onClick={() => setLocalSection('runtime')}>
                    Runtime
                </button>
            </div>

            <div className="assets-tabs">
                {(localSection === 'installed' ? installedTabs : runtimeTabs).map((tab) => {
                    const active = localSection === 'installed' ? installedKind === tab.key : runtimeKind === tab.key
                    return (
                        <button
                            key={tab.key}
                            className={`asset-tab ${active ? 'active' : ''}`}
                            onClick={() => localSection === 'installed'
                                ? setInstalledKind(tab.key as InstalledKind)
                                : setRuntimeKind(tab.key as RuntimeKind)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    )
                })}
            </div>

            {localSection === 'installed' && (
                <div className="sub-scope-row">
                    {(['all', 'global', 'stage', 'draft'] as SourceFilter[]).map((value) => (
                        <button
                            key={value}
                            className={`sub-scope-tag ${sourceFilter === value ? 'active' : ''}`}
                            onClick={() => setSourceFilter(value)}
                        >
                            {value === 'all' ? 'All' : value === 'global' ? (
                                <><HardDrive size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Global</>
                            ) : value === 'draft' ? (
                                <><Plus size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Draft</>
                            ) : (
                                <><FolderOpen size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Stage</>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {localSection === 'installed' && (
                <div className="asset-authoring-row">
                    {installedKind === 'performer' && (
                        <button className="btn" onClick={createNewPerformer}>
                            <Plus size={10} /> New Performer
                        </button>
                    )}
                    {installedKind === 'tal' && (
                        <button className="btn" onClick={() => createNewPerformerDraftEntry('tal')}>
                            <Plus size={10} /> New Tal Draft
                        </button>
                    )}
                    {installedKind === 'dance' && (
                        <button className="btn" onClick={() => createNewPerformerDraftEntry('dance')}>
                            <Plus size={10} /> New Dance Draft
                        </button>
                    )}
                    {installedKind === 'act' && (
                        <div className="asset-authoring-row__note" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                            Acts are created from the Threads sidebar or by dragging from the registry.
                        </div>
                    )}
                    <div className="asset-authoring-row__note">
                        {authoringNoteForInstalledKind(installedKind)}
                    </div>
                </div>
            )}

            <div className="explorer__header">
                <div className="search-wrapper">
                    <Search size={12} className="icon-muted" />
                    <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={localPlaceholder} />
                </div>
            </div>

            {authoringHint ? <div className="asset-authoring-hint">{authoringHint}</div> : null}

            {showMcps ? (
                <AssetLibraryMcpManager
                    filteredMcps={filteredMcps}
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
                />
            ) : null}

            {showModels ? (
                <div className="sub-scope-row">
                    <select className="select" value={modelProviderFilter} onChange={(e) => setModelProviderFilter(e.target.value as ModelProviderFilter)}>
                        {modelProviderTabs.map((tab) => (
                            <option key={tab.key} value={tab.key}>{tab.label}</option>
                        ))}
                    </select>
                </div>
            ) : null}

            <AssetLibraryModelList
                showInstalledAssets={showInstalledAssets}
                showModels={showModels}
                showMcps={showMcps}
                assetsLoading={assetsLoading}
                filteredInstalledAssets={filteredInstalledAssets}
                filteredMcps={filteredMcps}
                groupedModels={groupedModels}
                selectedAsset={selectedAsset}
                selectedAssetKey={selectedAssetKey}
                selectedInstalled={selectedInstalled}
                authUser={authUser}
                detailActionStatus={detailActionStatus}
                detailActionLoading={detailActionLoading}
                expandedModelProviders={expandedModelProviders}
                setExpandedModelProviders={setExpandedModelProviders}
                installedEmptyMessage={installedEmptyMessage}
                onSelectAsset={onSelectAsset}
                onCloseAsset={onCloseAsset}
                onSaveLocal={onSaveLocal}
                onPublish={onPublish}
                onDeleteDraft={onDeleteDraft}
            />
        </>
    )
}
