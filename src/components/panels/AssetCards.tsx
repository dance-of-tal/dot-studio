// Draggable asset card sub-components
import { useEffect, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
    Hexagon,
    Zap,
    Package,
    Cpu,
    Server,
    Download,
    Globe,
    GripVertical,
    FolderOpen,
    Workflow,
    Trash2,
    Pencil,
    Loader2,
} from 'lucide-react';
import {
    normalizeAuthor,
    getAssetUrn,
    buildInstalledAssetDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
} from './asset-library-utils';
export { HoverableCard, PinnedDetailPanel } from './AssetPopover';
import { HoverableCard } from './AssetPopover';
import type { McpServer } from '../../types';
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants';
import type { AssetPanelHandler, LibraryAsset, McpPanelAsset, ModelPanelAsset } from './asset-panel-types';

function performerMcpSummary(asset: LibraryAsset) {
    if (asset.kind !== 'performer' || !Array.isArray(asset.declaredMcpServerNames) || asset.declaredMcpServerNames.length === 0) {
        return null
    }

    const matchCount = Array.isArray(asset.matchedMcpServerNames) ? asset.matchedMcpServerNames.length : 0
    const missingCount = Array.isArray(asset.missingMcpServerNames) ? asset.missingMcpServerNames.length : 0
    return `MCP ${asset.declaredMcpServerNames.length} declared · ${matchCount} match · ${missingCount} need mapping`
}

function assetKindIcon(kind: string, className = 'asset-icon combo') {
    if (kind === 'tal') return <Hexagon size={12} className="asset-icon tal" />
    if (kind === 'dance') return <Zap size={12} className="asset-icon dance" />
    if (kind === 'performer') return <Package size={12} className="asset-icon performer" />
    if (kind === 'act') return <Workflow size={12} className="asset-icon act" />
    if (kind === 'model') return <Cpu size={12} className="asset-icon model" />
    if (kind === 'mcp') return <Server size={12} className="asset-icon mcp" />
    return <Package size={12} className={className} />
}

function AssetCardHeader({
    icon,
    name,
    trailing,
    dragHandle = false,
}: {
    icon: React.ReactNode
    name: string
    trailing?: React.ReactNode
    dragHandle?: boolean
}) {
    return (
        <div className="asset-card__header">
            {dragHandle ? <GripVertical size={10} className="drag-handle" /> : null}
            {icon}
            <span className="asset-card__name">{name}</span>
            {trailing}
        </div>
    )
}

// ── DraggableAsset ──────────────────────────────────────

export function DraggableAsset({
    asset,
    selected,
    onSelect,
    onUninstall,
    onDeleteDraft,
    onEditDraft,
}: {
    asset: LibraryAsset
    selected: boolean
    onSelect: AssetPanelHandler
    onUninstall?: AssetPanelHandler
    onDeleteDraft?: AssetPanelHandler
    onEditDraft?: AssetPanelHandler
}) {
    const dragPayload = useMemo(() => buildInstalledAssetDragPayload(asset), [asset])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `asset-${asset.urn || asset.name}`,
        data: dragPayload,
    })

    const canDelete = asset.source === 'draft' ? !!onDeleteDraft : (asset.source === 'global' || asset.source === 'stage') ? !!onUninstall : false
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (asset.source === 'draft') {
            onDeleteDraft?.(asset)
        } else {
            onUninstall?.(asset)
        }
    }

    return (
        <HoverableCard asset={asset} installed>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`asset-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(asset)}
            >
                <AssetCardHeader
                    icon={assetKindIcon(asset.kind)}
                    name={asset.name}
                    dragHandle
                    trailing={
                        <>
                            {asset.source ? <span className={`source-badge ${asset.source}`}>{asset.source}</span> : undefined}
                            {asset.source === 'draft' && (asset.kind === 'tal' || asset.kind === 'dance') && onEditDraft && (
                                <button
                                    className="asset-card__edit-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEditDraft(asset) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Edit draft"
                                >
                                    <Pencil size={11} />
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    className="asset-card__delete-btn"
                                    onClick={handleDelete}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title={asset.source === 'draft' ? 'Delete draft' : 'Uninstall'}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </>
                    }
                />
                <div className="asset-card__author">{asset.author}</div>
                <div className="asset-card__desc">{asset.description || 'No description provided.'}</div>
                {performerMcpSummary(asset) ? (
                    <div className="asset-card__desc">{performerMcpSummary(asset)}</div>
                ) : null}
            </div>
        </HoverableCard>
    )
}

// ── DraggableModel ──────────────────────────────────────

export function DraggableModel({
    model,
    selected,
    onSelect,
}: {
    model: RuntimeModelCatalogEntry
    selected: boolean
    onSelect: AssetPanelHandler
}) {
    const dragPayload = useMemo(() => buildModelDragPayload(model), [model])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `model-${model.provider}-${model.id}`,
        data: dragPayload,
    })

    const modelAsset: ModelPanelAsset = { ...model, kind: 'model', name: model.name || model.id }

    return (
        <HoverableCard asset={modelAsset}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`asset-card model-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(modelAsset)}
            >
                <AssetCardHeader
                    icon={assetKindIcon('model')}
                    name={model.name || model.id}
                    dragHandle
                />
                <div className="asset-card__author">{model.providerName}</div>
                <div className="asset-card__desc">
                    {model.context ? `Ctx: ${Math.round(model.context / 1000)}k` : ''}
                    {model.connected ? ' • Ready' : ' • Not Configured'}
                </div>
            </div>
        </HoverableCard>
    )
}

// ── DraggableMcp ────────────────────────────────────────

export function DraggableMcp({
    mcp,
    selected,
    onSelect,
    onEdit,
    onDelete,
}: {
    mcp: McpServer
    selected: boolean
    onSelect: AssetPanelHandler
    onEdit?: AssetPanelHandler
    onDelete?: AssetPanelHandler
}) {
    const dragPayload = useMemo(() => buildMcpDragPayload(mcp), [mcp])
    const dragDisabled = mcp.defined === false
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-${mcp.name}`,
        data: dragPayload,
        disabled: dragDisabled,
    })

    const mcpAsset: McpPanelAsset = { ...mcp, kind: 'mcp' }

    return (
        <HoverableCard asset={mcpAsset}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`asset-card mcp-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(mcpAsset)}
            >
                <AssetCardHeader
                    icon={assetKindIcon('mcp')}
                    name={mcp.name}
                    dragHandle
                    trailing={
                        <>
                            {onEdit ? (
                                <button
                                    className="asset-card__edit-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(mcpAsset) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Edit server"
                                >
                                    <Pencil size={11} />
                                </button>
                            ) : null}
                            {onDelete ? (
                                <button
                                    className="asset-card__delete-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(mcpAsset) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Remove server"
                                >
                                    <Trash2 size={11} />
                                </button>
                            ) : null}
                        </>
                    }
                />
                <div className="asset-card__author">
                    <span className={`asset-mcp-editor__status-dot asset-mcp-editor__status-dot--${mcp.status || 'disconnected'}`} style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
                    {mcp.status}
                    {mcp.configType ? ` · ${mcp.configType}` : ''}
                </div>
                <div className="asset-card__desc">
                    {dragDisabled ? 'Save this server before dragging.' : 'Drag onto a performer to enable it there.'}
                </div>
            </div>
        </HoverableCard>
    )
}

// ── RegistryResult ──────────────────────────────────────

export function RegistryResult({
    item,
    installed,
    selected,
    onInstall,
    onSelect,
}: {
    item: LibraryAsset
    installed: boolean
    selected: boolean
    onInstall: (urn: string, scope: 'global' | 'stage') => Promise<unknown>
    onSelect: AssetPanelHandler
}) {
    const [installing, setInstalling] = useState(false)
    const [localInstalled, setLocalInstalled] = useState(installed)
    const [error, setError] = useState<string | null>(null)
    const [showScope, setShowScope] = useState(false)

    useEffect(() => {
        setLocalInstalled(installed)
    }, [installed])

    const urn = getAssetUrn(item) || ''

    const handleInstall = async (scope: 'global' | 'stage') => {
        setShowScope(false)
        setInstalling(true)
        setError(null)
        try {
            await onInstall(urn, scope)
            setLocalInstalled(true)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Install failed')
        } finally {
            setInstalling(false)
        }
    }

    return (
        <HoverableCard asset={item} installed={localInstalled}>
            <div
                className={`asset-card registry-result ${error ? 'has-error' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(item)}
            >
                <AssetCardHeader
                    icon={assetKindIcon(item.kind)}
                    name={item.name}
                    trailing={(
                        <>
                            <span className="badge">{item.kind}</span>
                            <div
                                style={{ position: 'relative', marginLeft: 'auto' }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <button
                                    className={`registry-install-btn ${localInstalled ? 'is-installed' : ''}`}
                                    onClick={() => localInstalled ? null : setShowScope(!showScope)}
                                    disabled={installing || localInstalled}
                                    title={localInstalled ? 'Already installed' : `Install ${urn}`}
                                >
                                    {localInstalled ? 'Installed' : installing ? <Loader2 size={11} className="spin-icon" /> : <Download size={11} />}
                                </button>
                                {showScope && (
                                    <div className="install-scope-menu">
                                        <button className="install-scope-opt" onClick={() => handleInstall('stage')}>
                                            <FolderOpen size={11} /> Workspace
                                        </button>
                                        <button className="install-scope-opt" onClick={() => handleInstall('global')}>
                                            <Globe size={11} /> Global
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                />
                <div className="asset-card__author">{normalizeAuthor(item.author)}</div>
                <div className="asset-card__desc">{item.description || 'No description.'}</div>
                {performerMcpSummary(item) ? (
                    <div className="asset-card__desc">{performerMcpSummary(item)}</div>
                ) : null}
                {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <div className="badges">
                        {item.tags.slice(0, 3).map((tag: string) => (
                            <span key={tag} className="badge">{tag}</span>
                        ))}
                    </div>
                )}
                {error && (
                    <div className="install-error">
                        {error}
                    </div>
                )}
            </div>
        </HoverableCard>
    )
}
