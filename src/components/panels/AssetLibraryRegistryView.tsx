import { useState } from 'react'
import { GitBranch, Globe, FolderOpen, Loader2, Search } from 'lucide-react'
import { useAddDance } from '../../hooks/queries'
import { PinnedDetailPanel, RegistryResult } from './AssetCards'
import type { RegistryKind } from './asset-library-utils'
import { getAssetSelectionKey, getAssetUrn } from './asset-library-utils'
import type { AssetPanelAction, AssetPanelAsset, AssetPanelAuthUser, AssetPanelHandler, LibraryAsset, RegistryGroup } from './asset-panel-types'

type Props = {
    registryQuery: string
    setRegistryQuery: (value: string) => void
    triggerSearch: () => void
    registryLoading: boolean
    registryResults: LibraryAsset[]
    registryError: unknown
    registryKind: RegistryKind
    setRegistryKind: (value: RegistryKind) => void
    registryGroups: RegistryGroup[]
    installedUrns: Set<string>
    selectedAsset: AssetPanelAsset | null
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser?: AssetPanelAuthUser
    detailActionStatus: string | null
    detailActionLoading: AssetPanelAction | null
    onSelectAsset: AssetPanelHandler
    onInstall: (urn: string, targetScope: 'global' | 'stage') => Promise<unknown>
    onCloseAsset: () => void
    onSaveLocal: AssetPanelHandler
    onPublish: AssetPanelHandler
    onDeleteDraft: AssetPanelHandler
}

export default function AssetLibraryRegistryView(props: Props) {
    const {
        registryQuery,
        setRegistryQuery,
        triggerSearch,
        registryLoading,
        registryResults,
        registryError,
        registryKind,
        setRegistryKind,
        registryGroups,
        installedUrns,
        selectedAsset,
        selectedAssetKey,
        selectedInstalled,
        authUser,
        detailActionStatus,
        detailActionLoading,
        onSelectAsset,
        onInstall,
        onCloseAsset,
        onSaveLocal,
        onPublish,
        onDeleteDraft,
    } = props

    return (
        <>
            <div className="explorer__header">
                <div className="search-wrapper">
                    <Globe size={12} className="icon-muted" />
                    <input
                        className="text-input"
                        value={registryQuery}
                        onChange={(e) => setRegistryQuery(e.target.value)}
                        placeholder="name, author, slug, tag..."
                        onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
                    />
                    <button className="registry-search-btn" onClick={triggerSearch} disabled={registryLoading}>
                        {registryLoading ? '...' : <Search size={12} />}
                    </button>
                </div>
            </div>

            <GitHubImportRow />

            <div className="registry-filters">
                <select
                    className="select"
                    value={registryKind}
                    onChange={(e) => setRegistryKind(e.target.value as RegistryKind)}
                >
                    <option value="all">All Kinds</option>
                    <option value="tal">Tal</option>
                    <option value="dance">Dance</option>
                    <option value="performer">Performer</option>
                    <option value="act">Act</option>
                </select>
            </div>

            {registryKind === 'all' && registryGroups.length > 0 && (
                <div className="registry-counts">
                    {registryGroups.map((group) => (
                        <span key={group.kind} className="registry-count-chip">
                            {group.label} {group.items.length}
                        </span>
                    ))}
                </div>
            )}

            <div className="asset-library-body">
                <div className="assets-list">
                    {registryLoading ? (
                        <div className="empty-state">Searching registry...</div>
                    ) : registryResults.length === 0 ? (
                        <div className="empty-state">
                            {registryError ? (
                                <span style={{ color: 'var(--tal-color)' }}>{(registryError as Error)?.message || 'Search failed.'}</span>
                            ) : registryQuery ? 'No results found.' : 'Search the DOT registry to discover and install assets.'}
                        </div>
                    ) : (
                        registryGroups.map((group) => (
                            <div key={group.kind} className="registry-group">
                                {registryKind === 'all' && (
                                    <div className="registry-group__header">
                                        {group.label} <span>{group.items.length}</span>
                                    </div>
                                )}
                                {group.items.map((item, index) => {
                                    const urn = getAssetUrn(item) || `${item.kind}:${item.author}:${item.name}:${index}`
                                    return (
                                        <RegistryResult
                                            key={urn}
                                            item={item}
                                            installed={installedUrns.has(getAssetUrn(item) || '')}
                                            selected={selectedAssetKey === getAssetSelectionKey(item)}
                                            onInstall={onInstall}
                                            onSelect={onSelectAsset}
                                        />
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>

                <PinnedDetailPanel
                    asset={selectedAsset}
                    installed={selectedInstalled}
                    onClose={onCloseAsset}
                    authUser={authUser}
                    actionStatus={detailActionStatus}
                    actionLoading={detailActionLoading}
                    onSaveLocal={onSaveLocal}
                    onPublish={onPublish}
                    onImportToStage={undefined}
                    onDeleteDraft={onDeleteDraft}
                />
            </div>
        </>
    )
}

function GitHubImportRow() {
    const [source, setSource] = useState('')
    const [status, setStatus] = useState<string | null>(null)
    const [showScope, setShowScope] = useState(false)
    const addMutation = useAddDance()

    const handleImport = async (scope: 'global' | 'stage') => {
        if (!source.trim() || addMutation.isPending) return
        setShowScope(false)
        setStatus(null)
        try {
            const result = await addMutation.mutateAsync({ source: source.trim(), scope })
            setSource('')
            setStatus(`✔ Imported ${result.installed.length} skill(s) as Dance (${scope === 'global' ? 'Global' : 'Workspace'})`)
            setTimeout(() => setStatus(null), 4000)
        } catch (err: unknown) {
            setStatus(`✗ ${err instanceof Error ? err.message : 'Import failed'}`)
        }
    }

    return (
        <div className="github-import-row">
            <div className="github-import-input">
                <GitBranch size={11} className="icon-muted" />
                <input
                    className="text-input"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && source.trim() && setShowScope(true)}
                    placeholder="owner/repo or GitHub URL"
                    disabled={addMutation.isPending}
                />
                <div style={{ position: 'relative' }}>
                    <button
                        className="btn btn-sm"
                        onClick={() => setShowScope(!showScope)}
                        disabled={!source.trim() || addMutation.isPending}
                    >
                        {addMutation.isPending ? <Loader2 size={10} className="spin" /> : 'Import as Dance'}
                    </button>
                    {showScope && (
                        <div className="install-scope-menu">
                            <button className="install-scope-opt" onClick={() => handleImport('stage')}>
                                <FolderOpen size={11} /> Workspace
                            </button>
                            <button className="install-scope-opt" onClick={() => handleImport('global')}>
                                <Globe size={11} /> Global
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {status && (
                <div className={`github-import-status ${status.startsWith('✗') ? 'error' : 'success'}`}>
                    {status}
                </div>
            )}
        </div>
    )
}
