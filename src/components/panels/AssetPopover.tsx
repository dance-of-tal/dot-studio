import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { api } from '../../api'
import AssetDetailBody from './AssetDetailBody'

export function useResolvedAssetDetail(asset: any | null) {
    const [detail, setDetail] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let cancelled = false
        setDetail(null)
        setLoading(false)

        if (!asset || !['tal', 'dance', 'performer', 'act'].includes(asset.kind) || asset.source === 'draft' || !asset.author || !(asset.slug || asset.name)) {
            return
        }

        setLoading(true)
        const request = asset.source === 'stage' || asset.source === 'global'
            ? api.assets.get(asset.kind, String(asset.author || '').replace(/^@/, ''), asset.slug || asset.name)
            : api.assets.getRegistry(asset.kind, String(asset.author || '').replace(/^@/, ''), asset.slug || asset.name)

        request
            .then((data) => {
                if (!cancelled) setDetail(data)
            })
            .catch(() => {
                if (!cancelled) setDetail(null)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [asset?.author, asset?.kind, asset?.name, asset?.slug, asset?.source, asset?.urn])

    return { resolvedAsset: detail || asset, loading }
}

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
        document.body,
    )
}

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
    onDeleteDraft,
}: {
    asset: any | null
    installed: boolean
    onClose: () => void
    authUser?: { authenticated: boolean; username: string | null }
    actionStatus?: string | null
    actionLoading?: 'save-local' | 'publish' | 'import' | null
    onSaveLocal?: (asset: any) => void | Promise<void>
    onPublish?: (asset: any) => void | Promise<void>
    onImportToStage?: (asset: any) => void | Promise<void>
    onDeleteDraft?: (asset: any) => void | Promise<void>
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
                    <button className="btn" onClick={() => onSaveLocal(resolvedAsset)} disabled={actionLoading !== null}>
                        {actionLoading === 'save-local' ? 'Saving…' : 'Save Local Fork'}
                    </button>
                </div>
            ) : null}
            {resolvedAsset?.source === 'stage' && authUser?.authenticated && onPublish ? (
                <div className="btns">
                    <button className="btn" onClick={() => onPublish(resolvedAsset)} disabled={actionLoading !== null}>
                        {actionLoading === 'publish' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            ) : null}
            {resolvedAsset?.kind === 'act' && (resolvedAsset?.source === 'stage' || resolvedAsset?.source === 'global') && onImportToStage ? (
                <div className="btns">
                    <button className="btn" onClick={() => onImportToStage(resolvedAsset)} disabled={actionLoading !== null}>
                        {actionLoading === 'import' ? 'Importing…' : 'Import to Stage'}
                    </button>
                </div>
            ) : null}
            {resolvedAsset?.source === 'draft' && onDeleteDraft ? (
                <div className="btns">
                    <button className="btn btn--danger" onClick={() => onDeleteDraft(resolvedAsset)}>
                        <Trash2 size={11} style={{ marginRight: 4 }} /> Delete Draft
                    </button>
                </div>
            ) : null}
            {!authUser?.authenticated && (resolvedAsset?.source === 'global' || resolvedAsset?.source === 'stage') ? (
                <div className="asset-detail-panel__note">
                    Sign in with DOT from the toolbar before saving a local fork or publishing assets.
                </div>
            ) : null}
            {actionStatus ? <div className="asset-detail-panel__note">{actionStatus}</div> : null}
            <AssetDetailBody asset={resolvedAsset} loading={loading} installed={installed} />
        </div>
    )
}
