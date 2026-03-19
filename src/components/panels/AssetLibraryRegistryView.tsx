import { Globe, Search } from 'lucide-react'
import { PinnedDetailPanel, RegistryResult } from './AssetCards'
import type { RegistryKind } from './asset-library-utils'
import { getAssetSelectionKey, getAssetUrn } from './asset-library-utils'

type Props = {
    registryQuery: string
    setRegistryQuery: (value: string) => void
    triggerSearch: () => void
    registryLoading: boolean
    registryResults: any[]
    registryError: unknown
    registryKind: RegistryKind
    setRegistryKind: (value: RegistryKind) => void
    registryGroups: Array<{ kind: string; label: string; items: any[] }>
    installedUrns: Set<string>
    selectedAsset: any
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser: any
    detailActionStatus: string | null
    detailActionLoading: null | 'save-local' | 'publish' | 'import'
    onSelectAsset: (asset: any) => void
    onInstall: (urn: string, targetScope: 'global' | 'stage') => Promise<any>
    onCloseAsset: () => void
    onSaveLocal: (asset: any) => void | Promise<void>
    onPublish: (asset: any) => void | Promise<void>
    onDeleteDraft: (asset: any) => void | Promise<void>
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
