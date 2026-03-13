import { useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@xyflow/react'
import { Workflow, ArrowLeft, Plus, Trash2, Bot, Hexagon, Zap, Cpu, Server, Pencil, EyeOff, Save, Shield, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import { useAssets, useMcpServers } from '../../hooks/queries'

import ActThreadPanel from './ActThreadPanel'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'

import PerformerComposeCards from '../performer/PerformerComposeCards'
import PerformerAdvancedSettings from '../performer/PerformerAdvancedSettings'
import ActCanvasNode from './ActCanvasNode'
import ModelVariantSelect from '../performer/ModelVariantSelect'

import AgentSelect from '../performer/AgentSelect'
import SafeReviewModal from '../../components/modals/SafeReviewModal'

import type { ActPerformerSessionBinding, ActSessionMode, ChatMessage } from '../../types'
import { usePerformerPresentation } from '../../hooks/usePerformerPresentation'
import {
    edgePath,
    previewEdgePath,
    buildRuntimeState,
    computeRuntimeGraphState,
    findOrphanedNodeIds,
    buildFocusedNodeSemantics,
    resolveInlineEditorContent,
    saveInlineEditorDraft,
} from './act-area-utils'
import type {
    ActAreaNodeView,
    ActAreaEdgeView,
    ActAreaPerformerDetail,
    ActAreaPerformerMap,
    ActAreaMessage,
    ActRuntimeSummary,
    RuntimeGraphState,
    InlineEditorState,
} from './act-area-utils'
import './ActAreaFrame.css'
import './ActGraph.css'

export default function ActAreaFrame({ data, id, selected }: any) {
    const actSessionMap = useStudioStore((state) => state.actSessionMap)
    const selectedActId = useStudioStore((state) => state.selectedActId)
    const selectedActSessionId = useStudioStore((state) => state.selectedActSessionId)
    const actPerformerChats = useStudioStore((state) => state.actPerformerChats)
    const actPerformerBindings = useStudioStore((state) => state.actPerformerBindings)
    const setPerformerMcpBinding = useStudioStore((state) => state.setPerformerMcpBinding)
    const setActExecutionMode = useStudioStore((state) => state.setActExecutionMode)
    const safeSummary = useStudioStore((state) => state.safeSummaries[`act:${id}`] || null)
    const refreshSafeOwner = useStudioStore((state) => state.refreshSafeOwner)
    const applySafeOwner = useStudioStore((state) => state.applySafeOwner)
    const discardSafeOwnerFile = useStudioStore((state) => state.discardSafeOwnerFile)
    const discardAllSafeOwner = useStudioStore((state) => state.discardAllSafeOwner)
    const undoLastSafeApply = useStudioStore((state) => state.undoLastSafeApply)
    const detachActSession = useStudioStore((state) => state.detachActSession)
    const width = Number(data.width || 420)
    const height = Number(data.height || 280)
    const rfWidth = useStore((state) => state.width)
    const rfHeight = useStore((state) => state.height)

    const nodes = (data.nodes || []) as ActAreaNodeView[]
    const edges = (data.edges || []) as ActAreaEdgeView[]
    const onConnectNodes = data.onConnectNodes as ((from: string, to: string) => void) | undefined
    const onRemoveEdge = data.onRemoveEdge as ((edgeId: string) => void) | undefined
    const onSetEntry = data.onSetEntry as ((nodeId: string) => void) | undefined
    const onFocusNode = data.onFocusNode as ((nodeId: string | null) => void) | undefined
    const onRemoveNode = data.onRemoveNode as ((nodeId: string) => void) | undefined
    const onCloseEdit = data.onCloseEdit as (() => void) | undefined
    const onUpdateName = data.onUpdateName as ((value: string) => void) | undefined
    const onUpdateDescription = data.onUpdateDescription as ((value: string) => void) | undefined
    const onUpdateMaxIterations = data.onUpdateMaxIterations as ((value: number) => void) | undefined
    const onUpdateSessionMode = data.onUpdateSessionMode as ((value: ActSessionMode) => void) | undefined
    const onAddNode = data.onAddNode as ((type: 'worker' | 'orchestrator' | 'parallel') => void) | undefined
    const onAutoArrange = data.onAutoArrange as (() => Promise<void> | void) | undefined
    const onUpdateEdge = data.onUpdateEdge as ((edgeId: string, patch: Record<string, unknown>) => void) | undefined
    const performerDetailsById = (data.performerDetailsById || {}) as Record<string, ActAreaPerformerDetail>
    const performersById = (data.performersById || {}) as ActAreaPerformerMap
    const { data: assetInventory = [] } = useAssets(!!data.editMode)
    const { data: mcpServers = [] } = useMcpServers(!!data.editMode)
    const onCreatePerformerForNode = data.onCreatePerformerForNode as ((nodeId: string, seededAsset?: Record<string, unknown> | null) => string | null) | undefined
    const editMode = !!data.editMode
    const threadMode = !editMode
    const allowGraphEditing = editMode
    const threadMessages = (data.threadMessages || []) as ActAreaMessage[]
    const currentSessionId = (id === selectedActId ? selectedActSessionId : null) || actSessionMap[id] || null
    const performerThreadMessages = (currentSessionId ? (actPerformerChats[currentSessionId] || {}) : {}) as Record<string, ChatMessage[]>
    const performerThreadBindings = (currentSessionId ? (actPerformerBindings[currentSessionId] || []) : []) as ActPerformerSessionBinding[]
    const sessionStatus = (data.sessionStatus || null) as 'idle' | 'running' | 'completed' | 'failed' | 'interrupted' | null
    const loading = !!data.loading
    const entryLabel = (data.entryLabel || null) as string | null
    const sessionMode = ((data.sessionMode || 'all_nodes_thread') as ActSessionMode)
    const runtimeSummary = (data.runtimeSummary || null) as ActRuntimeSummary | null
    const onSend = data.onSend as ((message: string) => Promise<void> | void) | undefined
    const onNewSession = data.onNewSession as (() => void) | undefined
    const onEditAct = data.onEditAct as (() => void) | undefined
    const focusedNodeId = data.focusedNodeId as string | null
    const [focusedEditorTab, setFocusedEditorTab] = useState<'basic' | 'advanced'>('basic')

    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
    const [threadInput, setThreadInput] = useState('')
    const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null)
    const [showSafeReview, setShowSafeReview] = useState(false)
    const [safeBusy, setSafeBusy] = useState(false)
    const [pendingModeSwitch, setPendingModeSwitch] = useState<'direct' | null>(null)
    const threadEndRef = useRef<HTMLDivElement | null>(null)


    const isFocused = !!data.focused
    const frameWidth = isFocused ? Math.max(rfWidth - 40, 420) : width
    const frameHeight = isFocused ? Math.max(rfHeight - 140, 320) : height

    const { isOver, setNodeRef } = useDroppable({
        id: `act-area-${id}`,
        data: {
            type: 'act-area',
            actId: id,
        },
    })

    const [connectFromId, setConnectFromId] = useState<string | null>(null)
    const skipClickNodeIdRef = useRef<string | null>(null)

    const canvasRef = useRef<HTMLDivElement | null>(null)
    const [connectPreviewPoint, setConnectPreviewPoint] = useState<{ x: number; y: number } | null>(null)

    useEffect(() => {
        if (!connectFromId) {
            setConnectPreviewPoint(null)
            return
        }
        if (!nodes.some((node) => node.id === connectFromId)) {
            setConnectFromId(null)
        }
    }, [connectFromId, nodes])

    useEffect(() => {
        if (!connectFromId) {
            return
        }

        const updatePreviewPoint = (clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (!rect) {
                return
            }
            setConnectPreviewPoint({
                x: clientX - rect.left,
                y: clientY - rect.top,
            })
        }

        const handleMove = (event: MouseEvent) => {
            updatePreviewPoint(event.clientX, event.clientY)
        }

        const handleUp = () => {
            setConnectFromId(null)
            setConnectPreviewPoint(null)
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)

        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }
    }, [connectFromId])

    useEffect(() => {
        if (!selectedEdgeId) {
            return
        }
        if (!edges.some((edge) => edge.id === selectedEdgeId)) {
            setSelectedEdgeId(null)
        }
    }, [edges, selectedEdgeId])

    useEffect(() => {
        setFocusedEditorTab('basic')
        setSelectedEdgeId(null)
    }, [focusedNodeId])

    // Keyboard shortcut: Delete / Backspace to remove focused node
    useEffect(() => {
        if (!editMode || !focusedNodeId) {
            return
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Delete' || event.key === 'Backspace') {
                const tag = (event.target as HTMLElement)?.tagName
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                    return
                }
                event.preventDefault()
                onRemoveNode?.(focusedNodeId)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [editMode, focusedNodeId, onRemoveNode])

    const nodeMap = useMemo(
        () => Object.fromEntries(nodes.map((node) => [node.id, node])),
        [nodes],
    )

    const { activeRuntimeNodeId, completedRuntimeNodeIds, failedRuntimeNodeIds } = useMemo(
        () => buildRuntimeState(runtimeSummary, loading, data.entryNodeId || null),
        [data.entryNodeId, loading, runtimeSummary],
    )
    const [runtimeGraph, setRuntimeGraph] = useState<RuntimeGraphState>({ width: 0, height: 0, positions: {} })
    const runtimeNodesKey = nodes.map((n) => n.id).sort().join(',')
    const runtimeEdgesKey = edges.map((e) => `${e.from}-${e.to}`).sort().join(',')
    useEffect(() => {
        let cancelled = false
        computeRuntimeGraphState(nodes, edges).then((nextGraph) => {
            if (cancelled) { return }
            setRuntimeGraph(nextGraph)
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runtimeNodesKey, runtimeEdgesKey, frameWidth])
    const focusedNode = focusedNodeId ? nodes.find((node) => node.id === focusedNodeId) || null : null
    const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) || null : null
    const focusedPerformerId = focusedNode && focusedNode.type !== 'parallel' ? focusedNode.performerId || null : null
    const focusedPerformer = focusedPerformerId ? performerDetailsById[focusedPerformerId] || null : null
    const focusedPerformerNode = focusedPerformerId ? performersById[focusedPerformerId] || null : null
    const openInlineDraftEditor = (
        kind: 'tal' | 'dance',
        performerId: string,
        ref?: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null,
    ) => {
        const existingContent = resolveInlineEditorContent(ref, data.drafts || {})
        setInlineEditor({ kind, performerId, content: existingContent })
    }
    const { presentation: focusedPerformerPresentation, runtimeTools: focusedRuntimeTools } = usePerformerPresentation(
        focusedPerformerNode,
        assetInventory,
        mcpServers,
        data.drafts || {},
    )
    const focusedMcpBindingRows = useMemo(
        () => (focusedPerformerPresentation.declaredMcpServerNames || [])
            .map((placeholderName) => ({
                placeholderName,
                serverName: focusedPerformerNode?.mcpBindingMap?.[placeholderName] || null,
            })),
        [focusedPerformerNode?.mcpBindingMap, focusedPerformerPresentation.declaredMcpServerNames],
    )
    const focusedMcpBindingOptions = useMemo(
        () => mcpServers.map((server) => ({
            name: server.name,
            disabled: server.enabled === false,
        })),
        [mcpServers],
    )

    useEffect(() => {
        if (!focusedPerformerId || !focusedPerformerNode?.mcpBindingMap) {
            return
        }
        const validNames = new Set(
            mcpServers
                .filter((server) => server.enabled !== false)
                .map((server) => server.name),
        )
        for (const [placeholderName, serverName] of Object.entries(focusedPerformerNode.mcpBindingMap)) {
            if (!serverName || validNames.has(serverName)) {
                continue
            }
            setPerformerMcpBinding(focusedPerformerId, placeholderName, null)
        }
    }, [focusedPerformerId, focusedPerformerNode?.mcpBindingMap, mcpServers, setPerformerMcpBinding])

    useEffect(() => {
        if (data.executionMode !== 'safe') {
            return
        }
        if (!(selected || editMode || showSafeReview)) {
            return
        }
        void refreshSafeOwner('act', id)
    }, [data.executionMode, editMode, id, refreshSafeOwner, selected, showSafeReview])

    const handleToggleExecutionMode = async () => {
        if (data.executionMode === 'safe') {
            const summary = safeSummary || await refreshSafeOwner('act', id)
            if (summary && summary.pendingCount > 0) {
                setPendingModeSwitch('direct')
                setShowSafeReview(true)
                return
            }
            setActExecutionMode(id, 'direct')
            return
        }

        setActExecutionMode(id, 'safe')
        void refreshSafeOwner('act', id)
    }

    const runSafeAction = async (
        task: () => Promise<void>,
        nextMode?: 'direct',
        notice = 'Updated the safe workspace and reset the act thread lineage.',
    ) => {
        setSafeBusy(true)
        try {
            await task()
            if (nextMode) {
                setActExecutionMode(id, nextMode)
            } else {
                detachActSession(id, notice)
            }
            void refreshSafeOwner('act', id)
            setShowSafeReview(false)
            setPendingModeSwitch(null)
        } finally {
            setSafeBusy(false)
        }
    }

    const { isOver: isPerformerOver, setNodeRef: setPerformerDropRef } = useDroppable({
        id: focusedNode ? `act-node-performer-${id}-${focusedNode.id}` : `act-node-performer-${id}-idle`,
        data: focusedNode ? { type: 'act-node-performer', actId: id, nodeId: focusedNode.id } : { type: 'act-node-performer' },
    })
    const { isOver: isTalOver, setNodeRef: setTalDropRef } = useDroppable({
        id: focusedNode ? `act-node-tal-${id}-${focusedNode.id}` : `act-node-tal-${id}-idle`,
        data: focusedNode ? { type: 'act-node-tal', actId: id, nodeId: focusedNode.id, performerId: focusedPerformerId } : { type: 'act-node-tal' },
    })
    const { isOver: isDanceOver, setNodeRef: setDanceDropRef } = useDroppable({
        id: focusedNode ? `act-node-dance-${id}-${focusedNode.id}` : `act-node-dance-${id}-idle`,
        data: focusedNode ? { type: 'act-node-dance', actId: id, nodeId: focusedNode.id, performerId: focusedPerformerId } : { type: 'act-node-dance' },
    })
    const { isOver: isModelOver, setNodeRef: setModelDropRef } = useDroppable({
        id: focusedNode ? `act-node-model-${id}-${focusedNode.id}` : `act-node-model-${id}-idle`,
        data: focusedNode ? { type: 'act-node-model', actId: id, nodeId: focusedNode.id, performerId: focusedPerformerId } : { type: 'act-node-model' },
    })
    const { isOver: isMcpOver, setNodeRef: setMcpDropRef } = useDroppable({
        id: focusedNode ? `act-node-mcp-${id}-${focusedNode.id}` : `act-node-mcp-${id}-idle`,
        data: focusedNode ? { type: 'act-node-mcp', actId: id, nodeId: focusedNode.id, performerId: focusedPerformerId } : { type: 'act-node-mcp' },
    })

    // Auto-arrange whenever nodes or edges change
    const nodesKey = nodes.map((n) => n.id).sort().join(',')
    const edgesKey = edges.map((e) => `${e.from}-${e.to}`).sort().join(',')
    useEffect(() => {
        if (!onAutoArrange || nodes.length === 0) {
            return
        }
        onAutoArrange()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodesKey, edgesKey])

    // Compute reachable nodes from entry via BFS
    const orphanedNodeIds = useMemo(() => {
        return findOrphanedNodeIds(nodes, edges, data.entryNodeId)
    }, [nodes, edges, data.entryNodeId])



    const canSendThread = !!threadInput.trim() && !!data.entryNodeId && !loading
    const focusedNodeSemantics = useMemo(
        () => buildFocusedNodeSemantics(focusedNode),
        [focusedNode],
    )

    return (
        <>
        <div ref={setNodeRef}>
            <CanvasWindowFrame
                className={`act-area-frame nowheel ${isFocused ? 'canvas-frame--focused' : ''} ${data.transformActive ? 'act-area-frame--transform-active' : ''} ${isOver ? 'act-area-frame--drop' : ''}`}
                width={frameWidth}
                height={frameHeight}
                transformActive={!!data.transformActive}
                onActivateTransform={data.onActivateTransform as (() => void) | undefined}
                onDeactivateTransform={data.onDeactivateTransform as (() => void) | undefined}
                selected={!!selected}
                minWidth={320}
                minHeight={220}
                headerStart={(
                    <div className="act-area-frame__title">
                        <Workflow size={13} />
                        {editMode ? (
                            <input
                                className="text-input act-area-frame__title-input nodrag nowheel"
                                value={data.name}
                                onChange={(event) => onUpdateName?.(event.target.value)}
                            />
                        ) : (
                            <span className="canvas-frame__name">{data.name}</span>
                        )}
                    </div>
                )}
                headerEnd={(
                    <div className="act-area-frame__meta">
                        <span className="canvas-frame__badge">
                            {data.executionMode === 'safe' ? 'Safe' : 'Direct'}
                        </span>
                        {safeSummary?.conflictCount ? (
                            <span className="canvas-frame__badge">
                                Conflict
                            </span>
                        ) : null}
                        {safeSummary?.pendingCount ? (
                            <span className="canvas-frame__badge">
                                {safeSummary.pendingCount} change{safeSummary.pendingCount === 1 ? '' : 's'}
                            </span>
                        ) : null}
                        {editMode ? (
                            <div className="act-area-frame__header-actions">
                                <button type="button" className="act-area-frame__toolbar-btn" onClick={(event) => {
                                    event.stopPropagation()
                                    void handleToggleExecutionMode()
                                }}>
                                    <Shield size={10} />
                                    <span>{data.executionMode === 'safe' ? 'Safe' : 'Direct'}</span>
                                </button>
                                {data.executionMode === 'safe' ? (
                                    <button type="button" className="act-area-frame__toolbar-btn" onClick={(event) => {
                                        event.stopPropagation()
                                        setPendingModeSwitch(null)
                                        setShowSafeReview(true)
                                    }}>
                                        <Save size={10} />
                                        <span>Review</span>
                                    </button>
                                ) : null}
                                <button type="button" className="act-area-frame__toolbar-btn" onClick={(event) => {
                                    event.stopPropagation()
                                    onCloseEdit?.()
                                }}>
                                    <ArrowLeft size={10} />
                                    <span>Back</span>
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        void handleToggleExecutionMode()
                                    }}
                                    title={data.executionMode === 'safe' ? 'Switch to Direct mode' : 'Switch to Safe mode'}
                                    style={{ padding: '0 6px', opacity: 0.8 }}
                                >
                                    {data.executionMode === 'safe' ? 'Safe' : 'Direct'}
                                </button>
                                {data.executionMode === 'safe' ? (
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            setPendingModeSwitch(null)
                                            setShowSafeReview(true)
                                        }}
                                        title="Review safe mode changes"
                                        style={{ padding: '0 6px', opacity: 0.8 }}
                                    >
                                        Review
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onEditAct?.()
                                    }}
                                    title="Edit act"
                                    style={{ padding: '0 4px', opacity: 0.7 }}
                                >
                                    <Pencil size={11} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        useStudioStore.getState().toggleActVisibility(id)
                                    }}
                                    title="Hide from Canvas"
                                    style={{ padding: '0 4px', opacity: 0.7 }}
                                >
                                    <EyeOff size={11} />
                                </button>
                            </>
                        )}
                    </div>
                )}
                bodyClassName="act-area-frame__body-shell nodrag nowheel"
            >
                {editMode ? (
                    <div className="act-area-frame__settings">
                        <textarea
                            className="text-input act-area-frame__description-input nodrag nowheel"
                            value={data.description || ''}
                            onChange={(event) => onUpdateDescription?.(event.target.value)}
                            placeholder="Description"
                        />
                        <label className="act-area-frame__iterations">
                            <span>Max iterations</span>
                            <input
                                className="text-input nodrag nowheel"
                                type="number"
                                min={1}
                                max={50}
                                value={data.maxIterations}
                                onChange={(event) => onUpdateMaxIterations?.(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="act-area-frame__iterations">
                            <span>Session mode</span>
                            <select
                                className="select nodrag nowheel"
                                value={sessionMode}
                                onChange={(event) => onUpdateSessionMode?.(event.target.value as ActSessionMode)}
                            >
                                <option value="all_nodes_thread">Keep all node sessions</option>
                                <option value="default">Use node defaults</option>
                            </select>
                        </label>
                    </div>
                ) : data.description ? (
                    <div className="act-area-frame__description">{data.description}</div>
                ) : null}
                {editMode ? (
                    <div className="act-area-frame__hint">
                        {connectFromId
                            ? `Choose a target node to connect from ${nodeMap[connectFromId]?.label || connectFromId}.`
                            : 'Add nodes, drag from a node border to connect edges, and edit one selected node or edge at a time.'}
                    </div>
                ) : null}
                <div className={`act-area-frame__body nodrag nowheel ${threadMode ? 'act-area-frame__body--thread' : ''}`}>
                    {threadMode ? (
                        <ActThreadPanel
                            sessionStatus={sessionStatus}
                            entryNodeId={data.entryNodeId || null}
                            entryLabel={entryLabel}
                            nodes={nodes}
                            edges={edges}
                            runtimeGraph={runtimeGraph}
                            activeRuntimeNodeId={activeRuntimeNodeId}
                            completedRuntimeNodeIds={completedRuntimeNodeIds}
                            failedRuntimeNodeIds={failedRuntimeNodeIds}
                            threadMessages={threadMessages}
                            performerThreadMessages={performerThreadMessages}
                            performerThreadBindings={performerThreadBindings}
                            loading={loading}
                            threadInput={threadInput}
                            canSendThread={canSendThread}
                            threadEndRef={threadEndRef}
                            onThreadInputChange={setThreadInput}
                            onSend={onSend || (() => undefined)}
                            onStop={data.onStop as (() => Promise<void> | void) | undefined}
                            onNewSession={onNewSession}
                        />
                    ) : (
                        <div className="act-area-frame__edit-layout">
                            {/* Fixed left inspector panel — always visible */}
                            <div
                                className="act-area-frame__detail-panel"
                                onPointerDownCapture={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {selectedEdge ? (
                                    <div className="act-area-frame__detail-card">
                                        <div className="act-area-frame__focus-editor-head">
                                            <div>
                                                <strong>Edge</strong>
                                                <span>Configure how this connection behaves in the act graph.</span>
                                            </div>
                                        </div>
                                        <div className="act-area-frame__focus-editor-main">
                                            <div className="act-area-frame__focus-editor-summary">
                                                <span className="act-area-frame__pill">{nodeMap[selectedEdge.from]?.label || selectedEdge.from}</span>
                                                <span className="act-area-frame__pill">to</span>
                                                <span className="act-area-frame__pill">{selectedEdge.to === '$exit' ? '$exit' : (nodeMap[selectedEdge.to]?.label || selectedEdge.to)}</span>
                                            </div>
                                            <div className="act-area-frame__edge-card">
                                                <div className="act-area-frame__edge-row">
                                                    <label className="act-area-frame__node-control">
                                                        <span>From</span>
                                                        <select
                                                            className="select nodrag nowheel"
                                                            value={selectedEdge.from}
                                                            onChange={(event) => onUpdateEdge?.(selectedEdge.id, { from: event.target.value })}
                                                        >
                                                            {nodes.map((node) => (
                                                                <option key={`${selectedEdge.id}-from-${node.id}`} value={node.id}>
                                                                    {node.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="act-area-frame__node-control">
                                                        <span>To</span>
                                                        <select
                                                            className="select nodrag nowheel"
                                                            value={selectedEdge.to}
                                                            onChange={(event) => onUpdateEdge?.(selectedEdge.id, { to: event.target.value })}
                                                        >
                                                            {nodes.map((node) => (
                                                                <option key={`${selectedEdge.id}-to-${node.id}`} value={node.id}>
                                                                    {node.label}
                                                                </option>
                                                            ))}
                                                            <option value="$exit">$exit</option>
                                                        </select>
                                                    </label>
                                                </div>
                                                <div className="act-area-frame__edge-row">
                                                    <label className="act-area-frame__node-control">
                                                        <span>Role</span>
                                                        <select
                                                            className="select nodrag nowheel"
                                                            value={selectedEdge.role || 'flow'}
                                                            onChange={(event) => onUpdateEdge?.(selectedEdge.id, {
                                                                role: event.target.value === 'branch' ? 'branch' : undefined,
                                                                ...(event.target.value === 'branch' ? { condition: undefined } : {}),
                                                            })}
                                                        >
                                                            <option value="flow">Flow</option>
                                                            <option value="branch" disabled={nodeMap[selectedEdge.from]?.type !== 'parallel'}>Branch</option>
                                                        </select>
                                                    </label>
                                                    <label className="act-area-frame__node-control" title="When this edge activates after the source node completes">
                                                        <span>Condition</span>
                                                        <select
                                                            className="select nodrag nowheel"
                                                            value={selectedEdge.condition || 'always'}
                                                            disabled={selectedEdge.role === 'branch'}
                                                            onChange={(event) => onUpdateEdge?.(selectedEdge.id, { condition: event.target.value })}
                                                        >
                                                            <option value="always">Always</option>
                                                            <option value="on_success">On Success</option>
                                                            <option value="on_fail">On Failure</option>
                                                        </select>
                                                    </label>
                                                </div>
                                                <div className="act-area-frame__focus-editor-actions">
                                                    <button
                                                        type="button"
                                                        className="act-area-frame__toolbar-btn act-area-frame__toolbar-btn--danger"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            onRemoveEdge?.(selectedEdge.id)
                                                        }}
                                                    >
                                                        <Trash2 size={10} />
                                                        <span>Remove edge</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : focusedNode ? (
                                    <div className="act-area-frame__detail-card">
                                        <div className="act-area-frame__focus-editor-head">
                                            <div>
                                                <strong>{focusedNode.label}</strong>
                                                <span>{focusedNode.type === 'parallel' ? 'Forks input through branch edges and joins results' : focusedNode.type === 'orchestrator' ? 'Uses LLM to choose one outgoing flow edge' : 'Executes a single LLM call and follows edges'}</span>
                                            </div>
                                            <div className="act-area-frame__focus-editor-tabs">
                                                <button
                                                    type="button"
                                                    className={`tab ${focusedEditorTab === 'basic' ? 'active' : ''}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setFocusedEditorTab('basic')
                                                    }}
                                                >
                                                    Basic
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`tab ${focusedEditorTab === 'advanced' ? 'active' : ''}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setFocusedEditorTab('advanced')
                                                    }}
                                                >
                                                    Advanced
                                                </button>
                                            </div>
                                        </div>
                                        <div className="act-area-frame__focus-editor-main">
                                            <div className="act-area-frame__focus-editor-summary">
                                                <span className="act-area-frame__pill">{focusedNodeSemantics || 'Node semantics'}</span>
                                                {focusedNode.entry ? <span className="act-area-frame__pill">Entry</span> : null}
                                            </div>
                                            {focusedNode.type === 'parallel' ? (
                                                <div className="act-area-frame__focus-editor-advanced">
                                                    <div className="act-area-frame__rail-empty">
                                                        Parallel nodes do not bind a performer. Configure branch and flow edges directly on the canvas, then use the toolbar below to remove the node if needed.
                                                    </div>
                                                    <div className="act-area-frame__focus-editor-actions">
                                                        <button
                                                            type="button"
                                                            className="act-area-frame__toolbar-btn act-area-frame__toolbar-btn--danger"
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                onRemoveNode?.(focusedNode.id)
                                                            }}
                                                        >
                                                            <Trash2 size={10} />
                                                            <span>Remove node</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : focusedEditorTab === 'basic' ? (
                                                <>
                                                    {focusedPerformerId && focusedPerformerNode ? (
                                                        <div className="act-area-frame__identity-row">
                                                            <label className="act-area-frame__node-control">
                                                                <span>Name</span>
                                                                <input
                                                                    className="text-input nodrag nowheel"
                                                                    value={focusedPerformerNode.name || ''}
                                                                    placeholder="Performer name"
                                                                    onChange={(event) => {
                                                                        data.onUpdatePerformerName?.(focusedPerformerId, event.target.value)
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </label>
                                                        </div>
                                                    ) : null}
                                                    <PerformerComposeCards
                                                        cards={[
                                                            {
                                                                key: 'performer',
                                                                title: 'Performer',
                                                                description: focusedPerformer ? focusedPerformer.name : 'No performer assigned yet.',
                                                                hint: 'Drag & drop from Asset Library',
                                                                icon: <Bot size={12} />,
                                                                isOver: isPerformerOver,
                                                                setNodeRef: setPerformerDropRef,
                                                            },
                                                            {
                                                                key: 'tal',
                                                                title: 'Tal',
                                                                description: focusedPerformerPresentation.talAsset ? '' : (focusedPerformerId ? 'No Tal connected yet.' : 'Assign a performer first'),
                                                                hint: 'Drag & drop from Asset Library',
                                                                icon: <Hexagon size={12} />,
                                                                items: focusedPerformerPresentation.talAsset ? [{
                                                                    key: focusedPerformerPresentation.talAsset.urn,
                                                                    label: focusedPerformerPresentation.talAsset.name,
                                                                    description: focusedPerformerPresentation.talAsset.description || null,
                                                                    onOpen: focusedPerformerId ? () => openInlineDraftEditor('tal', focusedPerformerId, focusedPerformerNode?.talRef || null) : undefined,
                                                                    onRemove: focusedPerformerId ? () => {
                                                                        useStudioStore.getState().setPerformerTalRef(focusedPerformerId, null)
                                                                    } : undefined,
                                                                }] : undefined,
                                                                isOver: isTalOver,
                                                                setNodeRef: setTalDropRef,
                                                                disabled: !focusedPerformerId,
                                                                onClick: focusedPerformerId ? () => openInlineDraftEditor('tal', focusedPerformerId, focusedPerformerNode?.talRef || null) : undefined,
                                                            },
                                                            {
                                                                key: 'dances',
                                                                title: 'Dances',
                                                                description: focusedPerformerPresentation.danceAssets.length > 0 ? '' : (focusedPerformerId ? 'No Dances connected yet.' : 'Assign a performer first'),
                                                                hint: 'Drag & drop from Asset Library',
                                                                icon: <Zap size={12} />,
                                                                items: focusedPerformerPresentation.danceAssets.map((asset, index) => ({
                                                                    key: `${asset.urn}:${index}`,
                                                                    label: asset.name,
                                                                    description: asset.description || null,
                                                                    onOpen: focusedPerformerId && focusedPerformerNode?.danceRefs[index]
                                                                        ? () => openInlineDraftEditor('dance', focusedPerformerId, focusedPerformerNode.danceRefs[index])
                                                                        : undefined,
                                                                    onRemove: focusedPerformerId && focusedPerformerNode?.danceRefs[index] ? () => {
                                                                        data.onRemovePerformerDance?.(
                                                                            focusedPerformerId,
                                                                            focusedPerformerNode.danceRefs[index].kind === 'draft'
                                                                                ? focusedPerformerNode.danceRefs[index].draftId
                                                                                : focusedPerformerNode.danceRefs[index].urn,
                                                                        )
                                                                    } : undefined,
                                                                })),
                                                                isOver: isDanceOver,
                                                                setNodeRef: setDanceDropRef,
                                                                disabled: !focusedPerformerId,
                                                                onClick: focusedPerformerId ? () => openInlineDraftEditor('dance', focusedPerformerId, null) : undefined,
                                                            },
                                                            {
                                                                key: 'model',
                                                                title: 'Model',
                                                                description: focusedPerformerNode?.model || focusedPerformerNode?.modelPlaceholder ? '' : (focusedPerformerId ? 'No model selected yet.' : 'Assign a performer first'),
                                                                hint: 'Drag & drop from Asset Library',
                                                                icon: <Cpu size={12} />,
                                                                items: focusedPerformerNode?.model ? [{
                                                                    key: `${focusedPerformerNode.model.provider}:${focusedPerformerNode.model.modelId}`,
                                                                    label: focusedPerformerNode.model.modelId,
                                                                    description: focusedPerformerNode.model.provider,
                                                                    onRemove: focusedPerformerId ? () => {
                                                                        data.onSetPerformerModel?.(focusedPerformerId, null)
                                                                    } : undefined,
                                                                }] : focusedPerformerNode?.modelPlaceholder ? [{
                                                                    key: `${focusedPerformerNode.modelPlaceholder.provider}:${focusedPerformerNode.modelPlaceholder.modelId}:placeholder`,
                                                                    label: focusedPerformerNode.modelPlaceholder.modelId,
                                                                    description: `Missing in current Studio runtime · ${focusedPerformerNode.modelPlaceholder.provider}`,
                                                                    onRemove: focusedPerformerId ? () => {
                                                                        data.onSetPerformerModel?.(focusedPerformerId, null)
                                                                    } : undefined,
                                                                }] : undefined,
                                                                isOver: isModelOver,
                                                                setNodeRef: setModelDropRef,
                                                                disabled: !focusedPerformerId,
                                                            },
                                                            {
                                                                key: 'mcp',
                                                                title: 'MCP',
                                                                description: focusedPerformerPresentation.mcpServers.length > 0 || focusedPerformerPresentation.mcpPlaceholders.length > 0 ? '' : (focusedPerformerId ? 'No MCP servers connected yet.' : 'Assign a performer first'),
                                                                hint: 'Drag & drop from Asset Library',
                                                                icon: <Server size={12} />,
                                                                items: [
                                                                    ...focusedPerformerPresentation.mcpServers.map((server) => ({
                                                                        key: server.name,
                                                                        label: server.name,
                                                                        description: `${server.status}${server.tools.length ? ` · ${server.tools.length} tools` : ''}`,
                                                                        onRemove: focusedPerformerId ? () => {
                                                                            data.onRemovePerformerMcp?.(focusedPerformerId, server.name)
                                                                        } : undefined,
                                                                    })),
                                                                    ...focusedPerformerPresentation.mcpPlaceholders.map((name) => ({
                                                                        key: `placeholder:${name}`,
                                                                        label: name,
                                                                        description: 'Imported from asset · not mapped in Asset Library MCP catalog',
                                                                    })),
                                                                ],
                                                                isOver: isMcpOver,
                                                                setNodeRef: setMcpDropRef,
                                                                disabled: !focusedPerformerId,
                                                            },
                                                        ]}
                                                        footer={
                                                            !focusedPerformerId ? (
                                                                <div className="act-area-frame__focus-editor-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="act-area-frame__toolbar-btn"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            onCreatePerformerForNode?.(focusedNode.id, null)
                                                                        }}
                                                                    >
                                                                        <Plus size={10} />
                                                                        <span>Empty performer</span>
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="act-area-frame__focus-editor-actions">
                                                                    <span className="act-area-frame__node-config-hint">
                                                                        Drop Tal, Dance, Model, and MCP assets here to compose this node.
                                                                    </span>
                                                                </div>
                                                            )
                                                        }
                                                    />

                                                    <div className="act-area-frame__focus-editor-actions">
                                                        <button
                                                            type="button"
                                                            className="act-area-frame__toolbar-btn act-area-frame__toolbar-btn--danger"
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                onRemoveNode?.(focusedNode.id)
                                                            }}
                                                        >
                                                            <Trash2 size={10} />
                                                            <span>Remove node</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {focusedPerformerId && focusedPerformerNode ? (
                                                        <PerformerAdvancedSettings
                                                            performer={focusedPerformerNode}
                                                            talLabel={focusedPerformer?.talLabel || null}
                                                            modelLabel={focusedPerformer?.modelLabel || null}
                                                            agentLabel={focusedPerformer?.agentLabel || null}
                                                            mcpSummary={focusedPerformer?.mcpSummary || null}
                                                            onNameChange={(value) => {
                                                                data.onUpdatePerformerName?.(focusedPerformerId, value)
                                                            }}
                                                            onDanceDeliveryModeChange={(value) => {
                                                                data.onUpdatePerformerDanceDeliveryMode?.(focusedPerformerId, value)
                                                            }}
                                                            onOpenTalEditor={() => {
                                                                if (focusedPerformerId) {
                                                                    openInlineDraftEditor('tal', focusedPerformerId, focusedPerformerNode?.talRef || null)
                                                                }
                                                            }}
                                                            onCreateDanceDraft={() => {
                                                                if (focusedPerformerId) {
                                                                    openInlineDraftEditor('dance', focusedPerformerId, null)
                                                                }
                                                            }}
                                                            onEditDance={(ref) => {
                                                                if (focusedPerformerId) {
                                                                    openInlineDraftEditor('dance', focusedPerformerId, ref)
                                                                }
                                                            }}
                                                            onRemoveDance={(ref) => {
                                                                data.onRemovePerformerDance?.(focusedPerformerId, ref.kind === 'draft' ? ref.draftId : ref.urn)
                                                            }}
                                                            onClearModel={() => {
                                                                data.onSetPerformerModel?.(focusedPerformerId, null)
                                                            }}
                                                            runtimeControls={(
                                                                <>
                                                                    <AgentSelect
                                                                        value={focusedPerformerNode.agentId || null}
                                                                        onChange={(value) => {
                                                                            data.onSetPerformerAgentId?.(focusedPerformerId, value)
                                                                        }}
                                                                        titlePrefix="Act performer agent"
                                                                    />
                                                                    <ModelVariantSelect
                                                                        model={focusedPerformerNode.model || null}
                                                                        value={focusedNode.modelVariant || null}
                                                                        onChange={(value) => {
                                                                            data.onUpdateNode?.(focusedNode.id, { modelVariant: value })
                                                                        }}
                                                                        titlePrefix="Act node variant"
                                                                    />
                                                                </>
                                                            )}
                                                            runtimeStatus={focusedRuntimeTools ? (
                                                                <div className="adv-section__summary">
                                                                    {focusedRuntimeTools.resolvedTools.length > 0
                                                                        ? `Resolved tools: ${focusedRuntimeTools.resolvedTools.join(', ')}`
                                                                        : focusedRuntimeTools.selectedMcpServers.length > 0
                                                                            ? 'No MCP tools resolved for the current model yet.'
                                                                            : 'No MCP servers selected.'}
                                                                    {focusedRuntimeTools.unavailableDetails.length > 0 ? ` Unavailable: ${focusedRuntimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.` : ''}
                                                                </div>
                                                            ) : null}
                                                            onRemoveMcp={(serverName) => {
                                                                data.onRemovePerformerMcp?.(focusedPerformerId, serverName)
                                                            }}
                                                            onSetMcpBinding={(placeholderName, serverName) => {
                                                                setPerformerMcpBinding(focusedPerformerId, placeholderName, serverName)
                                                            }}
                                                            mcpBindings={focusedMcpBindingRows}
                                                            mcpOptions={focusedMcpBindingOptions}
                                                        />
                                                    ) : (
                                                        <div className="act-area-frame__rail-empty">
                                                            Create or import a performer first, then adjust Tal, Dances, Model, agent, and MCP settings here.
                                                        </div>
                                                    )}
                                                    <div className="act-area-frame__focus-editor-actions">
                                                        <button
                                                            type="button"
                                                            className="act-area-frame__toolbar-btn act-area-frame__toolbar-btn--danger"
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                onRemoveNode?.(focusedNode.id)
                                                            }}
                                                        >
                                                            <Trash2 size={10} />
                                                            <span>Remove node</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '20px 16px', color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: '1.6' }}>
                                        <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Inspector</strong>
                                        Select a node to wire its performer, Tal, Dances, and session behavior.
                                        <br />
                                        Select an edge to mark it as a normal flow or a parallel branch.
                                        <br />
                                        Use the chips on the canvas nodes to set entry and connect the graph.
                                    </div>
                                )}
                            </div>
                            {/* Canvas area with floating toolbar */}
                            <div
                                ref={canvasRef}
                                className="act-area-frame__canvas nodrag nowheel is-editing"
                                style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, minHeight: 0 }}
                                onClick={() => {
                                    setSelectedEdgeId(null)
                                    onFocusNode?.(null)
                                }}
                            >
                                {/* Floating add-node toolbar */}
                                <div className="act-area-frame__add-rail" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="act-area-frame__add-button"
                                        title="Runs a single LLM call and follows edges"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onAddNode?.('worker')
                                        }}
                                    >
                                        <Plus size={12} />
                                        <strong>Worker</strong>
                                        <span className="act-area-frame__add-hint">Single LLM call</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="act-area-frame__add-button"
                                        title="Uses LLM to pick one outgoing flow edge"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onAddNode?.('orchestrator')
                                        }}
                                    >
                                        <Plus size={12} />
                                        <strong>Orchestrator</strong>
                                        <span className="act-area-frame__add-hint">Chooses a flow edge</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="act-area-frame__add-button"
                                        title="Forks input through branch edges and joins their results"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onAddNode?.('parallel')
                                        }}
                                    >
                                        <Plus size={12} />
                                        <strong>Parallel</strong>
                                        <span className="act-area-frame__add-hint">Branch edge fan-out</span>
                                    </button>
                                </div>
                                {nodes.length === 0 ? (
                                    <div className="act-area-frame__empty">
                                        <strong>Build your act graph</strong>
                                        <span>Add nodes using the toolbar above, then drag between dots to connect them with edges.</span>
                                        <span style={{ marginTop: 4, opacity: 0.7 }}>Worker — single LLM call &bull; Orchestrator — chooses a flow edge &bull; Parallel — fans out through branch edges</span>
                                    </div>
                                ) : (
                                    <>
                                        <svg className="act-area-edges" width={frameWidth} height={frameHeight} aria-hidden="true">
                                            <defs>
                                                <marker
                                                    id={`act-arrow-${id}`}
                                                    markerWidth="8"
                                                    markerHeight="8"
                                                    refX="6"
                                                    refY="4"
                                                    orient="auto"
                                                >
                                                    <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                                                </marker>
                                            </defs>
                                            {edges.map((edge) => {
                                                const path = edgePath(nodeMap[edge.from], nodeMap[edge.to])
                                                if (!path) {
                                                    return null
                                                }
                                                return (
                                                    <path
                                                        key={edge.id}
                                                        d={path}
                                                        className={`act-area-edge ${edge.role === 'branch' ? 'act-area-edge--branch' : ''} ${selectedEdgeId === edge.id ? 'is-selected' : ''}`}
                                                        markerEnd={`url(#act-arrow-${id})`}
                                                        onClick={(event) => {
                                                            if (!allowGraphEditing) {
                                                                return
                                                            }
                                                            event.stopPropagation()
                                                            setSelectedEdgeId(edge.id)
                                                            onFocusNode?.(null)
                                                        }}
                                                    />
                                                )
                                            })}
                                            {connectFromId ? (
                                                <path
                                                    d={previewEdgePath(nodeMap[connectFromId], connectPreviewPoint) || ''}
                                                    className="act-area-edge act-area-edge--preview"
                                                />
                                            ) : null}
                                        </svg>
                                        {nodes.map((node) => (
                                            <ActCanvasNode
                                                key={node.id}
                                                actId={id}
                                                node={node}
                                                focused={focusedNodeId === node.id}
                                                orphaned={orphanedNodeIds.has(node.id)}
                                                allowGraphEditing={allowGraphEditing}
                                                awaitingTarget={allowGraphEditing && !!connectFromId && connectFromId !== node.id}
                                                connectFromId={connectFromId}
                                                onPointerDownMove={() => { }}
                                                onClickNode={(nodeId) => {
                                                    if (skipClickNodeIdRef.current === nodeId) {
                                                        skipClickNodeIdRef.current = null
                                                        return
                                                    }
                                                    setSelectedEdgeId(null)
                                                    onFocusNode?.(nodeId)
                                                }}
                                                onConnectToNode={(targetNodeId) => {
                                                    if (!connectFromId || connectFromId === targetNodeId) {
                                                        return
                                                    }
                                                    onConnectNodes?.(connectFromId, targetNodeId)
                                                    setConnectFromId(null)
                                                    setConnectPreviewPoint(null)
                                                    setSelectedEdgeId(null)
                                                }}
                                                onSetEntry={(nodeId) => onSetEntry?.(nodeId)}
                                                onRemoveNode={(nodeId) => onRemoveNode?.(nodeId)}
                                                onToggleConnectFrom={(nodeId, clientX, clientY) => {
                                                    setConnectFromId((current) => (current === nodeId ? null : nodeId))
                                                    const rect = canvasRef.current?.getBoundingClientRect()
                                                    if (rect) {
                                                        setConnectPreviewPoint({
                                                            x: clientX - rect.left,
                                                            y: clientY - rect.top,
                                                        })
                                                    }
                                                    setSelectedEdgeId(null)
                                                    onFocusNode?.(nodeId)
                                                }}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>
                            {/* Inline Tal / Dance editor panel */}
                            {inlineEditor ? (
                                <div
                                    className="act-area-frame__inline-editor nodrag nowheel"
                                    onPointerDownCapture={(event) => event.stopPropagation()}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="act-area-frame__inline-editor-header">
                                        <strong>{inlineEditor.kind === 'tal' ? 'New Tal' : 'New Dance'}</strong>
                                        <div className="act-area-frame__inline-editor-actions">
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                title="Save and attach to performer"
                                                disabled={!inlineEditor.content.trim()}
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    saveInlineEditorDraft(inlineEditor)
                                                    setInlineEditor(null)
                                                }}
                                            >
                                                <Save size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                title="Close editor"
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    setInlineEditor(null)
                                                }}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className="act-area-frame__inline-editor-textarea nodrag nowheel"
                                        value={inlineEditor.content}
                                        onClick={(event) => event.stopPropagation()}
                                        onPointerDownCapture={(event) => event.stopPropagation()}
                                        onChange={(event) => setInlineEditor({ ...inlineEditor, content: event.target.value })}
                                        placeholder={inlineEditor.kind === 'tal' ? 'Write your Tal prompt here...' : 'Write your Dance (tool definition) here...'}
                                        spellCheck={false}
                                        autoFocus
                                    />
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </CanvasWindowFrame>
        </div>
        {showSafeReview ? (
            <SafeReviewModal
                title={pendingModeSwitch === 'direct' ? `${data.name} · Review before switching to Direct` : `${data.name} · Safe Mode Review`}
                summary={safeSummary}
                busy={safeBusy}
                onClose={() => {
                    setShowSafeReview(false)
                    setPendingModeSwitch(null)
                }}
                onApply={() => {
                    void runSafeAction(() => applySafeOwner('act', id), pendingModeSwitch || undefined)
                }}
                onDiscardAll={() => {
                    void runSafeAction(() => discardAllSafeOwner('act', id), pendingModeSwitch || undefined)
                }}
                onDiscardFile={(filePath) => {
                    void runSafeAction(
                        () => discardSafeOwnerFile('act', id, filePath),
                        undefined,
                        `Discarded ${filePath} from the safe workspace and reset the act thread lineage.`,
                    )
                }}
                onUndoLastApply={() => {
                    void runSafeAction(
                        () => undoLastSafeApply('act', id),
                        undefined,
                        'Undid the last apply and reset the act thread lineage.',
                    )
                }}
            />
        ) : null}
        </>
    )
}
