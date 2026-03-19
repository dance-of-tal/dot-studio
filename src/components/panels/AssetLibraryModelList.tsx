import { DraggableAsset, DraggableMcp, DraggableModel, PinnedDetailPanel } from './AssetCards'
import { MAX_MODELS_PER_PROVIDER, getAssetSelectionKey } from './asset-library-utils'

type Props = {
    showInstalledAssets: boolean
    showModels: boolean
    showMcps: boolean
    assetsLoading: boolean
    filteredInstalledAssets: any[]
    filteredMcps: any[]
    groupedModels: Array<{ key: string; label: string; items: any[]; connected?: boolean }>
    selectedAsset: any
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser: any
    detailActionStatus: string | null
    detailActionLoading: null | 'save-local' | 'publish' | 'import'
    expandedModelProviders: Record<string, boolean>
    setExpandedModelProviders: (value: any) => void
    installedEmptyMessage: string
    onSelectAsset: (asset: any) => void
    onCloseAsset: () => void
    onSaveLocal: (asset: any) => void
    onPublish: (asset: any) => void
    onDeleteDraft: (asset: any) => void
}

export default function AssetLibraryModelList({
    showInstalledAssets,
    showModels,
    showMcps,
    assetsLoading,
    filteredInstalledAssets,
    filteredMcps,
    groupedModels,
    selectedAsset,
    selectedAssetKey,
    selectedInstalled,
    authUser,
    detailActionStatus,
    detailActionLoading,
    expandedModelProviders,
    setExpandedModelProviders,
    installedEmptyMessage,
    onSelectAsset,
    onCloseAsset,
    onSaveLocal,
    onPublish,
    onDeleteDraft,
}: Props) {
    return (
        <div className="asset-library-body">
            <div className="assets-list">
                {showInstalledAssets && (
                    assetsLoading ? <div className="empty-state">Loading...</div> :
                        filteredInstalledAssets.length === 0 ? <div className="empty-state">{installedEmptyMessage}</div> :
                            filteredInstalledAssets.map((asset) => (
                                <DraggableAsset
                                    key={asset.urn}
                                    asset={asset}
                                    selected={selectedAssetKey === getAssetSelectionKey(asset)}
                                    onSelect={onSelectAsset}
                                />
                            ))
                )}
                {showModels && (
                    groupedModels.length === 0 ? <div className="empty-state">No models available for this filter.</div> :
                        groupedModels.map((group) => {
                            const expanded = !!expandedModelProviders[group.key]
                            const visibleItems = expanded ? group.items : group.items.slice(0, MAX_MODELS_PER_PROVIDER)
                            const hiddenCount = group.items.length - visibleItems.length

                            return (
                                <div key={group.key} className="asset-group">
                                    <div className="asset-group__header">
                                        <div className="asset-group__meta">
                                            <span>{group.label}</span>
                                            <span className="asset-group__count">{group.items.length}</span>
                                            {!group.connected && <span className="asset-group__status">Not connected</span>}
                                        </div>
                                        {hiddenCount > 0 ? (
                                            <button
                                                className="asset-group__toggle"
                                                onClick={() => setExpandedModelProviders((current: any) => ({
                                                    ...current,
                                                    [group.key]: true,
                                                }))}
                                            >
                                                +{hiddenCount} more
                                            </button>
                                        ) : null}
                                    </div>
                                    {visibleItems.map((model) => (
                                        <DraggableModel
                                            key={`${model.provider}-${model.id}`}
                                            model={model}
                                            selected={selectedAssetKey === getAssetSelectionKey({ kind: 'model', ...model })}
                                            onSelect={onSelectAsset}
                                        />
                                    ))}
                                </div>
                            )
                        })
                )}
                {showMcps && (
                    filteredMcps.length === 0 ? <div className="empty-state">No MCP servers connected.</div> :
                        filteredMcps.map((mcp) => (
                            <DraggableMcp
                                key={mcp.name}
                                mcp={mcp}
                                selected={selectedAssetKey === getAssetSelectionKey({ kind: 'mcp', ...mcp })}
                                onSelect={onSelectAsset}
                            />
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
    )
}
