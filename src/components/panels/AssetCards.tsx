// Sub-components extracted from AssetLibrary.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Hexagon,
    Zap,
    Package,
    Cpu,
    Server,
    Download,
    Globe,
    GripVertical,
    X,
    FolderOpen,
    GitBranch,
} from 'lucide-react';
import { api } from '../../api';
import {
    displayUrn,
    normalizeAuthor,
    isInstalledAssetKind,
    getAssetUrn,
    buildInstalledAssetDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
} from './asset-library-utils';

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

// ── useResolvedAssetDetail hook ─────────────────────────

export function useResolvedAssetDetail(asset: any | null) {
    const [detail, setDetail] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let cancelled = false
        setDetail(null)
        setLoading(false)

        if (!asset || !isInstalledAssetKind(asset.kind) || asset.source === 'draft' || !asset.author || !(asset.slug || asset.name)) {
            return
        }

        setLoading(true)
        const request = asset.source === 'stage' || asset.source === 'global'
            ? api.assets.get(asset.kind, String(asset.author || '').replace(/^@/, ''), asset.slug || asset.name)
            : api.assets.getRegistry(asset.kind, String(asset.author || '').replace(/^@/, ''), asset.slug || asset.name)

        request
            .then((data) => {
                if (!cancelled) {
                    setDetail(data)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setDetail(null)
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [asset?.author, asset?.kind, asset?.name, asset?.slug, asset?.source, asset?.urn])

    return { resolvedAsset: detail || asset, loading }
}

// ── AssetDetailBody ─────────────────────────────────────

export function AssetDetailBody({
    asset,
    loading,
    installed,
}: {
    asset: any
    loading: boolean
    installed?: boolean
}) {
    if (!asset) {
        return null
    }

    const author = normalizeAuthor(asset.author)
    const urn = getAssetUrn(asset)
    const tags = Array.isArray(asset.tags) ? asset.tags : []
    const inlineContent = asset.body || asset.instructions || asset.content
    const nodeCount = asset.nodeCount || Object.keys(asset.nodes || {}).length || 0
    const edgeCount = Array.isArray(asset.edges) ? asset.edges.length : 0
    const hasStructuredDetail = !!inlineContent
        || !!asset.talUrn
        || (Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0)
        || !!asset.model
        || nodeCount > 0
        || edgeCount > 0
        || typeof asset.maxIterations === 'number'
    const summaryOnly = asset.source === 'registry' && !loading && !hasStructuredDetail

    return (
        <>
            <div className="asset-popover__meta">
                {author || asset.providerName || asset.status || 'Local'}
                {asset.kind && ` · ${asset.kind}`}
                {asset.source && (
                    <span className={`source-badge ${asset.source}`} style={{ marginLeft: 6 }}>
                        {asset.source}
                    </span>
                )}
                {installed && asset.source !== 'stage' && asset.source !== 'global' && (
                    <span className="asset-detail-panel__badge">Installed</span>
                )}
            </div>

            {urn && (
                <div className="asset-popover__urn">{urn}</div>
            )}

            <div className="asset-popover__desc">
                {asset.description || asset.desc || 'No description available.'}
            </div>

            {loading && (
                <div className="asset-popover__section-item">Loading details...</div>
            )}

            {summaryOnly && !loading && (
                <div className="asset-detail-panel__note">
                    Registry preview shows summary metadata only. Install the asset to inspect full content.
                </div>
            )}

            {inlineContent && (
                <div className="asset-popover__section">
                    <div className="section-title">
                        {asset.kind === 'tal' ? 'Instructions' : asset.kind === 'dance' ? 'Skills' : 'Content'}
                    </div>
                    <div className="asset-popover__content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {inlineContent}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {tags.length > 0 && (
                <div className="asset-popover__tags">
                    {tags.map((tag: string) => (
                        <span key={tag} className="asset-popover__tag">{tag}</span>
                    ))}
                </div>
            )}

            {asset.kind === 'performer' && (
                <>
                    {asset.talUrn && (
                        <div className="asset-popover__section">
                            <div className="section-title">Tal</div>
                            <div className="asset-popover__section-item">{displayUrn(asset.talUrn)}</div>
                        </div>
                    )}
                    {Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0 && (
                        <div className="asset-popover__section">
                            <div className="section-title">Dances ({asset.danceUrns.length})</div>
                            {asset.danceUrns.map((danceUrn: string) => (
                                <div key={danceUrn} className="asset-popover__section-item">{displayUrn(danceUrn)}</div>
                            ))}
                        </div>
                    )}
                    {asset.model && (
                        <div className="asset-popover__section">
                            <div className="section-title">Model</div>
                            <div className="asset-popover__section-item">
                                {typeof asset.model === 'string' ? asset.model : asset.model.modelId}
                            </div>
                        </div>
                    )}
                </>
            )}

            {asset.kind === 'act' && (
                <div className="asset-popover__section">
                    <div className="section-title">Act Summary</div>
                    <div className="asset-popover__section-item">Entry: {asset.entryNode || 'n/a'}</div>
                    <div className="asset-popover__section-item">Nodes: {nodeCount}</div>
                    <div className="asset-popover__section-item">Edges: {edgeCount}</div>
                    {typeof asset.maxIterations === 'number' && (
                        <div className="asset-popover__section-item">Max iterations: {asset.maxIterations}</div>
                    )}
                </div>
            )}

            {asset.kind === 'model' && (
                <div className="asset-popover__section">
                    <div className="section-title">Details</div>
                    {asset.context && <div className="asset-popover__section-item">Context: {Math.round(asset.context / 1000)}k tokens</div>}
                    <div className="asset-popover__section-item">Status: {asset.connected ? 'Ready' : 'Not Configured'}</div>
                    <div className="asset-popover__section-item">Tools: {asset.toolCall ? 'Yes' : 'No'}</div>
                    <div className="asset-popover__section-item">Attachments: {asset.attachment ? 'Yes' : 'No'}</div>
                    {asset.modalities && (
                        <div className="asset-popover__section-item">
                            I/O: {(asset.modalities.input || []).join(', ') || 'text'} / {(asset.modalities.output || []).join(', ') || 'text'}
                        </div>
                    )}
                </div>
            )}

            {asset.kind === 'mcp' && (
                <>
                    <div className="asset-popover__section">
                        <div className="section-title">Capabilities</div>
                        <div className="asset-popover__section-item">Status: {asset.status || 'unknown'}</div>
                        <div className="asset-popover__section-item">{asset.tools?.length || 0} Tools</div>
                        <div className="asset-popover__section-item">{asset.resources?.length || 0} Resources</div>
                        {asset.authStatus === 'needs_auth' && (
                            <div className="asset-popover__section-item">Authentication required</div>
                        )}
                        {asset.clientRegistrationRequired && (
                            <div className="asset-popover__section-item">OAuth client registration required</div>
                        )}
                        {asset.error && (
                            <div className="asset-popover__section-item">{asset.error}</div>
                        )}
                    </div>
                    {Array.isArray(asset.tools) && asset.tools.length > 0 && (
                        <div className="asset-popover__section">
                            <div className="section-title">Tools</div>
                            {asset.tools.slice(0, 8).map((tool: any) => (
                                <div key={tool.name} className="asset-popover__section-item">
                                    {tool.name}{tool.description ? ` · ${tool.description}` : ''}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    )
}

// ── AssetPopover ────────────────────────────────────────

export function AssetPopover({ asset, rect, installed, onEnter, onLeave }: {
    asset: any
    rect: DOMRect
    installed?: boolean
    onEnter: () => void
    onLeave: () => void
}) {
    const { resolvedAsset, loading } = useResolvedAssetDetail(asset)
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 420))
    const left = rect.right + 8

    return createPortal(
        <div
            className="asset-popover"
            style={{ top, left }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            <div className="asset-popover__title">{resolvedAsset?.name || asset?.name}</div>
            <AssetDetailBody asset={resolvedAsset} loading={loading} installed={installed} />
        </div>,
        document.body
    )
}

// ── HoverableCard ───────────────────────────────────────

export function HoverableCard({
    asset,
    installed,
    children,
}: {
    asset: any
    installed?: boolean
    children: React.ReactNode
}) {
    const [showPopover, setShowPopover] = useState(false)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const ref = useRef<HTMLDivElement>(null)
    const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const show = () => {
        clearTimeout(leaveTimer.current)
        enterTimer.current = setTimeout(() => {
            if (ref.current) {
                setRect(ref.current.getBoundingClientRect())
                setShowPopover(true)
            }
        }, 350)
    }

    const scheduleHide = () => {
        clearTimeout(enterTimer.current)
        leaveTimer.current = setTimeout(() => setShowPopover(false), 200)
    }

    const cancelHide = () => {
        clearTimeout(leaveTimer.current)
    }

    return (
        <div ref={ref} onMouseEnter={show} onMouseLeave={scheduleHide} style={{ position: 'relative' }}>
            {children}
            {showPopover && rect && (
                <AssetPopover
                    asset={asset}
                    rect={rect}
                    installed={installed}
                    onEnter={cancelHide}
                    onLeave={scheduleHide}
                />
            )}
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

// ── PinnedDetailPanel ───────────────────────────────────

export function PinnedDetailPanel({
    asset,
    installed,
    onClose,
    authUser,
    actionStatus,
    actionLoading,
    onSaveLocal,
    onPublish,
    onImportToStage,
}: {
    asset: any | null
    installed: boolean
    onClose: () => void
    authUser?: { authenticated: boolean; username: string | null }
    actionStatus?: string | null
    actionLoading?: 'save-local' | 'publish' | 'import' | null
    onSaveLocal?: (asset: any) => Promise<void>
    onPublish?: (asset: any) => Promise<void>
    onImportToStage?: (asset: any) => Promise<void>
}) {
    const { resolvedAsset, loading } = useResolvedAssetDetail(asset)

    if (!asset) {
        return (
            <div className="asset-detail-panel asset-detail-panel--empty">
                <div className="asset-detail-panel__empty-copy">
                    Click a card to pin its details here.
                </div>
            </div>
        )
    }

    return (
        <div className="asset-detail-panel">
            <div className="asset-detail-panel__header">
                <div>
                    <div className="section-title">Pinned Details</div>
                    <div className="asset-detail-panel__title">{resolvedAsset?.name || asset.name}</div>
                </div>
                <button className="icon-btn" onClick={onClose} title="Clear detail panel">
                    <X size={14} />
                </button>
            </div>
            {resolvedAsset?.source === 'global' && authUser?.authenticated && onSaveLocal ? (
                <div className="btns">
                    <button
                        className="btn"
                        onClick={() => onSaveLocal(resolvedAsset)}
                        disabled={actionLoading !== null}
                    >
                        {actionLoading === 'save-local' ? 'Saving…' : 'Save Local Fork'}
                    </button>
                </div>
            ) : null}
            {resolvedAsset?.source === 'stage' && authUser?.authenticated && onPublish ? (
                <div className="btns">
                    <button
                        className="btn"
                        onClick={() => onPublish(resolvedAsset)}
                        disabled={actionLoading !== null}
                    >
                        {actionLoading === 'publish' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            ) : null}
            {resolvedAsset?.kind === 'act' && (resolvedAsset?.source === 'stage' || resolvedAsset?.source === 'global') && onImportToStage ? (
                <div className="btns">
                    <button
                        className="btn"
                        onClick={() => onImportToStage(resolvedAsset)}
                        disabled={actionLoading !== null}
                    >
                        {actionLoading === 'import' ? 'Importing…' : 'Import to Stage'}
                    </button>
                </div>
            ) : null}
            {!authUser?.authenticated && (resolvedAsset?.source === 'global' || resolvedAsset?.source === 'stage') ? (
                <div className="asset-detail-panel__note">
                    Sign in with DOT from the toolbar before saving a local fork or publishing assets.
                </div>
            ) : null}
            {actionStatus ? (
                <div className="asset-detail-panel__note">
                    {actionStatus}
                </div>
            ) : null}
            <AssetDetailBody asset={resolvedAsset} loading={loading} installed={installed} />
        </div>
    )
}
