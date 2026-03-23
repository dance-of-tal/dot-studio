import type { Dispatch, SetStateAction } from 'react'
import type { McpServer } from '../../types'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { DraggableAsset, DraggableMcp, DraggableModel, PinnedDetailPanel } from './AssetCards'
import { MAX_MODELS_PER_PROVIDER, getAssetSelectionKey } from './asset-library-utils'
import type { AssetPanelAction, AssetPanelAsset, AssetPanelAuthUser, AssetPanelHandler, LibraryAsset } from './asset-panel-types'

type Props = {
    showInstalledAssets: boolean
    showModels: boolean
    showMcps: boolean
    assetsLoading: boolean
    filteredInstalledAssets: LibraryAsset[]
    filteredMcps: McpServer[]
    groupedModels: Array<{ key: string; label: string; items: RuntimeModelCatalogEntry[]; connected?: boolean }>
    selectedAsset: AssetPanelAsset | null
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser?: AssetPanelAuthUser
    detailActionStatus: string | null
    detailActionLoading: AssetPanelAction | null
    expandedModelProviders: Record<string, boolean>
    setExpandedModelProviders: Dispatch<SetStateAction<Record<string, boolean>>>
    installedEmptyMessage: string
    onSelectAsset: AssetPanelHandler
    onCloseAsset: () => void
    onSaveLocal: AssetPanelHandler
    onPublish: AssetPanelHandler
    onDeleteDraft: AssetPanelHandler
    onEditDraft?: AssetPanelHandler
    onUninstall?: AssetPanelHandler
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
    onEditDraft,
    onUninstall,
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
                                    onUninstall={onUninstall}
                                    onDeleteDraft={onDeleteDraft}
                                    onEditDraft={onEditDraft}
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
                                                onClick={() => setExpandedModelProviders((current) => ({
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
                onUninstall={onUninstall}
            />
        </div>
    )
}
