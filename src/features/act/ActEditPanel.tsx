/**
 * ActEditPanel — Expanded edit view inside ActFrame.
 *
 * Shows:
 * - Mini performer cards (name, model badge, source indicator)
 * - SVG relation arrows between performers
 * - Action bar: [+ Performer], execution mode selector
 * - Drop zone hint for DnD performer copy
 */
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Zap, Plus, Trash2, RefreshCw, Link, Unlink } from 'lucide-react'
import { useStudioStore } from '../../store'
import type { ActPerformer, ActRelation } from '../../types'
import './ActEditPanel.css'

/* ── Mini performer card ── */

function MiniPerformerCard({
    performerKey,
    performer,
    actId,
    isSelected,
    isConnecting,
    onSelect,
    onStartConnect,
}: {
    performerKey: string
    performer: ActPerformer
    actId: string
    isSelected: boolean
    isConnecting: boolean
    onSelect: () => void
    onStartConnect: () => void
}) {
    const { removePerformerFromAct, syncPerformerFromCanvas } = useStudioStore()

    const modelLabel = performer.model
        ? `${performer.model.provider}/${performer.model.modelId}`.split('/').pop()
        : null

    return (
        <div
            className={`act-edit__card ${isSelected ? 'act-edit__card--selected' : ''} ${isConnecting ? 'act-edit__card--connecting' : ''}`}
            onClick={onSelect}
        >
            <div className="act-edit__card-header">
                <span className="act-edit__card-name">{performer.name}</span>
                {performer.sourcePerformerId && (
                    <span className="act-edit__card-copy-badge" title="Copied from canvas performer">copy</span>
                )}
            </div>
            <div className="act-edit__card-meta">
                {modelLabel && <span className="act-edit__card-badge">{modelLabel}</span>}
                {performer.talRef && <span className="act-edit__card-badge">tal</span>}
                {performer.danceRefs.length > 0 && <span className="act-edit__card-badge">{performer.danceRefs.length}d</span>}
            </div>
            <div className="act-edit__card-actions">
                <button
                    className="icon-btn"
                    title="Connect to another performer"
                    onClick={(e) => { e.stopPropagation(); onStartConnect() }}
                >
                    <Link size={10} />
                </button>
                {performer.sourcePerformerId && (
                    <button
                        className="icon-btn"
                        title="Sync from canvas performer"
                        onClick={(e) => { e.stopPropagation(); syncPerformerFromCanvas(actId, performerKey) }}
                    >
                        <RefreshCw size={10} />
                    </button>
                )}
                <button
                    className="icon-btn"
                    title="Remove from Act"
                    onClick={(e) => { e.stopPropagation(); removePerformerFromAct(actId, performerKey) }}
                >
                    <Trash2 size={10} />
                </button>
            </div>
        </div>
    )
}

/* ── Relation SVG ── */

function RelationsOverlay({
    performers,
    relations,
    actId,
    containerRef,
}: {
    performers: Record<string, ActPerformer>
    relations: ActRelation[]
    actId: string
    containerRef: React.RefObject<HTMLDivElement | null>
}) {
    const { removeRelationFromAct } = useStudioStore()
    const [dims, setDims] = useState({ width: 0, height: 0 })

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const ro = new ResizeObserver(() => {
            setDims({ width: el.offsetWidth, height: el.offsetHeight })
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [containerRef])

    const performerKeys = Object.keys(performers)
    if (performerKeys.length === 0 || relations.length === 0) return null

    // Simple layout: assign each performer a position in a grid
    const getCardCenter = (key: string) => {
        const idx = performerKeys.indexOf(key)
        if (idx < 0) return { x: 0, y: 0 }
        const card = containerRef.current?.querySelector(`[data-performer-key="${key}"]`) as HTMLElement | null
        if (card) {
            return {
                x: card.offsetLeft + card.offsetWidth / 2,
                y: card.offsetTop + card.offsetHeight / 2,
            }
        }
        // Fallback: grid layout estimate
        const cols = Math.max(1, Math.ceil(Math.sqrt(performerKeys.length)))
        const col = idx % cols
        const row = Math.floor(idx / cols)
        return {
            x: (col + 0.5) * (dims.width / cols),
            y: (row + 0.5) * 80 + 8,
        }
    }

    return (
        <svg className="act-edit__relations-svg" width={dims.width} height={dims.height}>
            <defs>
                <marker id={`arrowhead-${actId}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="var(--act-accent, #f59e0b)" opacity="0.7" />
                </marker>
            </defs>
            {relations.map((rel) => {
                const from = getCardCenter(rel.from)
                const to = getCardCenter(rel.to)
                if (!from || !to) return null
                const midX = (from.x + to.x) / 2
                const midY = (from.y + to.y) / 2
                return (
                    <g key={rel.id}>
                        <line
                            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                            stroke="var(--act-accent, #f59e0b)"
                            strokeWidth={1.5}
                            strokeOpacity={0.5}
                            markerEnd={`url(#arrowhead-${actId})`}
                        />
                        <circle
                            cx={midX} cy={midY} r={6}
                            fill="var(--bg-panel)"
                            stroke="var(--act-accent, #f59e0b)"
                            strokeWidth={1}
                            className="act-edit__relation-delete"
                            onClick={() => removeRelationFromAct(actId, rel.id)}
                        />
                        <text
                            x={midX} y={midY + 3.5}
                            textAnchor="middle"
                            fontSize={8}
                            fill="var(--act-accent, #f59e0b)"
                            className="act-edit__relation-delete"
                            onClick={() => removeRelationFromAct(actId, rel.id)}
                        >×</text>
                    </g>
                )
            })}
        </svg>
    )
}

/* ── Main Panel ── */

export default function ActEditPanel({ actId }: { actId: string }) {
    const {
        acts, performers: canvasPerformers,
        addPerformerToAct, addNewPerformerInAct, addRelationInAct,
        setActExecutionMode,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === actId), [acts, actId])
    const containerRef = useRef<HTMLDivElement>(null)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

    const handleSelect = useCallback((key: string) => {
        if (connectingFrom) {
            if (connectingFrom !== key) {
                addRelationInAct(actId, connectingFrom, key)
            }
            setConnectingFrom(null)
        } else {
            setSelectedKey(selectedKey === key ? null : key)
        }
    }, [actId, addRelationInAct, connectingFrom, selectedKey])

    const handleStartConnect = useCallback((key: string) => {
        setConnectingFrom(connectingFrom === key ? null : key)
    }, [connectingFrom])

    const handleAddPerformer = useCallback(() => {
        const count = act ? Object.keys(act.performers).length : 0
        addNewPerformerInAct(actId, `Performer ${count + 1}`)
    }, [actId, act, addNewPerformerInAct])

    const handleAddFromCanvas = useCallback((performerId: string) => {
        addPerformerToAct(actId, performerId)
    }, [actId, addPerformerToAct])

    if (!act) return null

    const performerEntries = Object.entries(act.performers)
    const canvasPerformersNotInAct = canvasPerformers.filter(
        (p) => !act.performers[p.id]
    )

    return (
        <div className="act-edit" ref={containerRef}>
            {/* ── Relation SVG overlay ── */}
            <RelationsOverlay
                performers={act.performers}
                relations={act.relations}
                actId={actId}
                containerRef={containerRef}
            />

            {/* ── Performer cards grid ── */}
            <div className="act-edit__grid">
                {performerEntries.map(([key, performer]) => (
                    <div key={key} data-performer-key={key}>
                        <MiniPerformerCard
                            performerKey={key}
                            performer={performer}
                            actId={actId}
                            isSelected={selectedKey === key}
                            isConnecting={connectingFrom === key}
                            onSelect={() => handleSelect(key)}
                            onStartConnect={() => handleStartConnect(key)}
                        />
                    </div>
                ))}

                {performerEntries.length === 0 && (
                    <div className="act-edit__empty">
                        <Zap size={16} />
                        <span>No performers yet</span>
                    </div>
                )}
            </div>

            {/* ── Connection mode indicator ── */}
            {connectingFrom && (
                <div className="act-edit__connect-hint">
                    Click a target performer to create a relation
                    <button className="icon-btn" onClick={() => setConnectingFrom(null)}>
                        <Unlink size={10} /> Cancel
                    </button>
                </div>
            )}

            {/* ── Action bar ── */}
            <div className="act-edit__actions">
                <button className="act-edit__action-btn" onClick={handleAddPerformer}>
                    <Plus size={11} /> New Performer
                </button>

                {canvasPerformersNotInAct.length > 0 && (
                    <select
                        className="act-edit__add-select"
                        value=""
                        onChange={(e) => {
                            if (e.target.value) handleAddFromCanvas(e.target.value)
                        }}
                    >
                        <option value="">+ From Canvas…</option>
                        {canvasPerformersNotInAct.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                )}

                <div className="act-edit__spacer" />

                <select
                    className="act-edit__mode-select"
                    value={act.executionMode}
                    onChange={(e) => setActExecutionMode(actId, e.target.value as any)}
                >
                    <option value="direct">Direct</option>
                    <option value="safe">Safe</option>
                </select>
            </div>
        </div>
    )
}
