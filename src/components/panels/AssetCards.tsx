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
    GitBranch,
} from 'lucide-react';
import {
    normalizeAuthor,
    getAssetUrn,
    buildInstalledAssetDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
} from './asset-library-utils';
export { HoverableCard, PinnedDetailPanel, useResolvedAssetDetail } from './AssetPopover';
import { HoverableCard } from './AssetPopover';

function assetKindIcon(kind: string, className = 'asset-icon combo') {
    if (kind === 'tal') return <Hexagon size={12} className="asset-icon tal" />
    if (kind === 'dance') return <Zap size={12} className="asset-icon dance" />
    if (kind === 'performer') return <Package size={12} className="asset-icon performer" />
    if (kind === 'act') return <GitBranch size={12} className="asset-icon act" />
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
}: {
    asset: any
    selected: boolean
    onSelect: (asset: any) => void
}) {
    const dragPayload = useMemo(() => buildInstalledAssetDragPayload(asset), [asset])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `asset-${asset.urn || asset.name}`,
        data: dragPayload,
    })

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
                    trailing={asset.source ? <span className={`source-badge ${asset.source}`}>{asset.source}</span> : undefined}
                />
                <div className="asset-card__author">{asset.author}</div>
                <div className="asset-card__desc">{asset.description || 'No description provided.'}</div>
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
    model: any
    selected: boolean
    onSelect: (asset: any) => void
}) {
    const dragPayload = useMemo(() => buildModelDragPayload(model), [model])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `model-${model.provider}-${model.id}`,
        data: dragPayload,
    })

    const modelAsset = { ...model, kind: 'model', name: model.name || model.id }

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
}: {
    mcp: any
    selected: boolean
    onSelect: (asset: any) => void
}) {
    const dragPayload = useMemo(() => buildMcpDragPayload(mcp), [mcp])
    const dragDisabled = mcp.enabled === false || mcp.defined === false
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-${mcp.name}`,
        data: dragPayload,
        disabled: dragDisabled,
    })

    const mcpAsset = { ...mcp, kind: 'mcp' }

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
                />
                <div className="asset-card__author">
                    <span className={`asset-mcp-editor__status-dot asset-mcp-editor__status-dot--${mcp.status || 'disconnected'}`} style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
                    {mcp.status}
                    {mcp.configType ? ` · ${mcp.configType}` : ''}
                    {mcp.enabled === false ? ' · disabled' : ''}
                </div>
                <div className="asset-card__desc">
                    {mcp.tools?.length || 0} Tools • {mcp.resources?.length || 0} Resources
                    {dragDisabled ? ' • not draggable' : ''}
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
    item: any
    installed: boolean
    selected: boolean
    onInstall: (urn: string, scope: 'global' | 'stage') => Promise<any>
    onSelect: (asset: any) => void
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
        } catch (err: any) {
            setError(err?.message || 'Install failed')
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
                                    {localInstalled ? 'Installed' : installing ? '...' : <Download size={11} />}
                                </button>
                                {showScope && (
                                    <div className="install-scope-menu">
                                        <button className="install-scope-opt" onClick={() => handleInstall('stage')}>
                                            <FolderOpen size={11} /> Stage
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
