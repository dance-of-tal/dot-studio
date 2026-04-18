import { HardDrive, Globe, X } from 'lucide-react'
import './AssetLibrary.css'
import AssetLibraryLocalView from './AssetLibraryLocalView'
import AssetLibraryRegistryView from './AssetLibraryRegistryView'
import McpCatalogImpactDialog from './McpCatalogImpactDialog'
import UninstallConfirmDialog from './UninstallConfirmDialog'
import { useAssetLibraryController } from './useAssetLibraryController'

export default function AssetLibrary({ onClose }: { onClose?: () => void }) {
    const controller = useAssetLibraryController()

    return (
        <div className="assets-panel">
            <div className="drawer-header">
                <span className="drawer-header__title">Asset Library</span>
                {onClose ? (
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                ) : null}
            </div>

            <div className="scope-selector">
                <button
                    className={`scope-btn ${controller.scope === 'local' ? 'active' : ''}`}
                    onClick={() => controller.setScope('local')}
                >
                    <HardDrive size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Local
                </button>
                <button
                    className={`scope-btn ${controller.scope === 'registry' ? 'active' : ''}`}
                    onClick={() => controller.setScope('registry')}
                >
                    <Globe size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Registry
                </button>
            </div>

            {controller.scope === 'local' ? (
                <AssetLibraryLocalView
                    scope={controller.scope}
                    localSection={controller.localSection}
                    setLocalSection={controller.setLocalSection}
                    installedKind={controller.installedKind}
                    setInstalledKind={controller.setInstalledKind}
                    runtimeKind={controller.runtimeKind}
                    setRuntimeKind={controller.setRuntimeKind}
                    sourceFilter={controller.sourceFilter}
                    setSourceFilter={controller.setSourceFilter}
                    modelProviderFilter={controller.modelProviderFilter}
                    setModelProviderFilter={controller.setModelProviderFilter}
                    filter={controller.filter}
                    setFilter={controller.setFilter}
                    localPlaceholder={controller.localPlaceholder}
                    authoringHint={controller.authoringHint}
                    assetsLoading={controller.assetsLoading}
                    filteredInstalledAssets={controller.filteredInstalledAssets}
                    groupedModels={controller.groupedModels}
                    filteredMcps={controller.filteredMcps}
                    liveMcpServers={controller.liveMcpServers}
                    selectedAsset={controller.selectedAsset}
                    selectedAssetKey={controller.selectedAssetKey}
                    selectedInstalled={controller.selectedInstalled}
                    authUser={controller.authUser}
                    detailActionStatus={controller.detailActionStatus}
                    detailActionLoading={controller.detailActionLoading}
                    onSelectAsset={controller.setSelectedAsset}
                    onCloseAsset={() => controller.setSelectedAsset(null)}
                    onSaveLocal={(asset) => controller.handlePinnedAssetAction(asset, 'save-local')}
                    onPublish={(asset) => controller.handlePinnedAssetAction(asset, 'publish')}
                    onDeleteDraft={controller.handleDeleteDraft}
                    onEditDraft={controller.handleEditDraft}
                    onUninstall={controller.handleUninstallAsset}
                    onCheckDanceUpdates={controller.handleCheckDanceUpdates}
                    onUpdateDance={controller.handleUpdateDance}
                    onCheckDanceRepoChanges={(asset) => controller.handleCheckDanceUpdates(asset, true)}
                    onReimportDanceSource={controller.handleReimportDanceSource}
                    createNewPerformer={controller.createNewPerformer}
                    createNewAct={controller.createNewAct}
                    createNewPerformerDraftEntry={controller.createNewPerformerDraftEntry}
                    showInstalledAssets={controller.showInstalledAssets}
                    showModels={controller.showModels}
                    showMcps={controller.showMcps}
                    mcpEntries={controller.mcpEntries}
                    mcpCatalogStatus={controller.mcpCatalogStatus}
                    mcpCatalogSaving={controller.mcpCatalogSaving}
                    runtimeReloadPending={controller.runtimeReloadPending}
                    pendingMcpAuthName={controller.pendingMcpAuthName}
                    createMcpEntryDraft={controller.createMcpEntryDraft}
                    saveMcpEntry={controller.saveMcpEntry}
                    deleteMcpEntry={controller.deleteMcpEntry}
                    connectMcpServer={controller.connectMcpServer}
                    startMcpAuthFlow={controller.startMcpAuthFlow}
                    clearMcpAuth={controller.clearMcpAuth}
                    expandedModelProviders={controller.expandedModelProviders}
                    setExpandedModelProviders={controller.setExpandedModelProviders}
                    modelProviderTabs={controller.modelProviderTabs}
                />
            ) : (
                <AssetLibraryRegistryView
                    registryQuery={controller.registryQuery}
                    setRegistryQuery={(value) => controller.handleQueryChange(value)}
                    triggerSearch={controller.triggerSearch}
                    registryLoading={controller.registryLoading}
                    registryResults={controller.registryResults}
                    registryError={controller.registryError}
                    registryKind={controller.registryKind}
                    setRegistryKind={(value) => {
                        controller.setRegistryKind(value)
                        controller.setSearchEnabled(false)
                    }}
                    registryGroups={controller.registryGroups}
                    installedUrns={controller.installedUrns}
                    selectedAsset={controller.selectedAsset}
                    selectedAssetKey={controller.selectedAssetKey}
                    selectedInstalled={controller.selectedInstalled}
                    authUser={controller.authUser}
                    detailActionStatus={controller.detailActionStatus}
                    detailActionLoading={controller.detailActionLoading}
                    onSelectAsset={controller.setSelectedAsset}
                    onInstall={controller.handleRegistryInstall}
                    onCloseAsset={() => controller.setSelectedAsset(null)}
                    onSaveLocal={(asset) => controller.handlePinnedAssetAction(asset, 'save-local')}
                    onPublish={(asset) => controller.handlePinnedAssetAction(asset, 'publish')}
                    onDeleteDraft={controller.handleDeleteDraft}
                />
            )}

            {controller.uninstallPlan && (
                <UninstallConfirmDialog
                    target={controller.uninstallPlan.target}
                    dependents={controller.uninstallPlan.dependents}
                    loading={controller.uninstallLoading}
                    actionName={controller.uninstallPlan.actionName}
                    onConfirm={controller.confirmUninstall}
                    onCancel={controller.cancelUninstall}
                />
            )}

            {controller.mcpImpactDialog && (
                <McpCatalogImpactDialog
                    impact={controller.mcpImpactDialog}
                    loading={controller.mcpImpactSaving}
                    onConfirm={controller.confirmMcpImpactSave}
                    onCancel={controller.cancelMcpImpactSave}
                />
            )}
        </div>
    )
}
