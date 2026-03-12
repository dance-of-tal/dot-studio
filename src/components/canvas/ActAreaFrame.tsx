import { useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@xyflow/react'
import { Workflow, ArrowLeft, Plus, Trash2, Bot, Hexagon, Zap, Cpu, Server, Pencil, EyeOff, Save, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import { useAssets, useMcpServers, useRuntimeTools } from '../../hooks/queries'
import { computeActAutoLayout, ACT_LAYOUT_NODE_WIDTH, ACT_LAYOUT_NODE_HEIGHT } from '../../lib/act-layout'
import ActThreadPanel from './ActThreadPanel'
import CanvasWindowFrame from './CanvasWindowFrame'
import useTransformChrome from './useTransformChrome'
import PerformerComposeCards from './PerformerComposeCards'
import PerformerAdvancedSettings from './PerformerAdvancedSettings'
import ActCanvasNode from './ActCanvasNode'
import ModelVariantSelect from './ModelVariantSelect'

import AgentSelect from './AgentSelect'

import type { ActPerformerSessionBinding, ActSessionMode, ChatMessage, PerformerNode } from '../../types'
import { buildAssetCardMap, buildMcpServerMap, resolvePerformerPresentation, resolvePerformerRuntimeConfig } from '../../lib/performers'
import './ActAreaFrame.css'

type ActAreaNodeView = {
    id: string
    type: 'worker' | 'orchestrator' | 'parallel'
    label: string
    position: { x: number; y: number }
    entry: boolean
    sessionPolicy?: 'fresh' | 'node' | 'performer' | 'act' | null
    sessionLifetime?: 'run' | 'thread' | null
    sessionModeOverride?: boolean | null
    modelVariant?: string | null
    performerId?: string | null
    performerName?: string | null
    performerSummary?: string | null
}

type ActAreaEdgeView = {
    id: string
    from: string
    to: string
    role?: 'branch'
    condition?: 'always' | 'on_success' | 'on_fail'
}

type ActAreaPerformerDetail = {
    id: string
    name: string
    talLabel?: string | null
    danceSummary?: string | null
    modelLabel?: string | null
    agentLabel?: string | null
    mcpSummary?: string | null
    planMode?: boolean
    scope?: 'shared' | 'act-owned'
}

type ActAreaPerformerMap = Record<string, PerformerNode>

type ActAreaMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
}

type ActRuntimeHistoryEntry = {
    nodeId: string
    nodeType: 'worker' | 'orchestrator' | 'parallel'
    action: string
    timestamp: number
}

type ActRuntimeSummary = {
    currentNodeId?: string | null
    history?: ActRuntimeHistoryEntry[]
}

function edgePath(from: ActAreaNodeView | undefined, to: ActAreaNodeView | undefined) {
    if (!from || !to) {
        return null
    }

    const startX = from.position.x + ACT_LAYOUT_NODE_WIDTH
    const startY = from.position.y + (ACT_LAYOUT_NODE_HEIGHT / 2)
    const endX = to.position.x
    const endY = to.position.y + (ACT_LAYOUT_NODE_HEIGHT / 2)
    const delta = Math.max(40, Math.abs(endX - startX) * 0.5)
    return `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`
}

function previewEdgePath(from: ActAreaNodeView | undefined, point: { x: number; y: number } | null) {
    if (!from || !point) {
        return null
    }

    const startX = from.position.x + ACT_LAYOUT_NODE_WIDTH
    const startY = from.position.y + (ACT_LAYOUT_NODE_HEIGHT / 2)
    const delta = Math.max(40, Math.abs(point.x - startX) * 0.5)
    return `M ${startX} ${startY} C ${startX + delta} ${startY}, ${point.x - delta} ${point.y}, ${point.x} ${point.y}`
}

export default function ActAreaFrame({ data, id, selected }: any) {
    const actSessionMap = useStudioStore((state) => state.actSessionMap)
    const selectedActId = useStudioStore((state) => state.selectedActId)
    const selectedActSessionId = useStudioStore((state) => state.selectedActSessionId)
    const actPerformerChats = useStudioStore((state) => state.actPerformerChats)
    const actPerformerBindings = useStudioStore((state) => state.actPerformerBindings)
    const setPerformerMcpBinding = useStudioStore((state) => state.setPerformerMcpBinding)
    const width = Number(data.width || 420)
    const height = Number(data.height || 280)
    const rfWidth = useStore((state) => state.width)
    const rfHeight = useStore((state) => state.height)
    const onResizeFrame = data.onResizeFrame as ((width: number, height: number) => void) | undefined
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
    const [inlineEditor, setInlineEditor] = useState<{ kind: 'tal' | 'dance'; performerId: string; content: string } | null>(null)
    const threadEndRef = useRef<HTMLDivElement | null>(null)
    const [resizeDraft, setResizeDraft] = useState<{ width: number; height: number } | null>(null)
    const {
        isTransformChromeActive,
        showResizeChrome,
        activateTransformChrome,
        handleFramePointerDownCapture,
        handleResizeStart,
        handleResizeEnd,
    } = useTransformChrome({
        active: !!data.transformActive,
        onActivate: data.onActivateTransform as (() => void) | undefined,
        onDeactivate: data.onDeactivateTransform as (() => void) | undefined,
    })
    const hasFrameChrome = !!selected || showResizeChrome
    const isFocused = !!data.focused
    const frameWidth = resizeDraft?.width ?? (isFocused ? Math.max(rfWidth - 40, 420) : width)
    const frameHeight = resizeDraft?.height ?? (isFocused ? Math.max(rfHeight - 140, 320) : height)

    const { isOver, setNodeRef } = useDroppable({
        id: `act-area-${id}`,
        data: {
            type: 'act-area',
            actId: id,
        },
    })

    const [connectFromId, setConnectFromId] = useState<string | null>(null)
    const skipClickNodeIdRef = useRef<string | null>(null)
    const resizeRef = useRef<{
        startX: number
        startY: number
        startWidth: number
        startHeight: number
        nextWidth: number
        nextHeight: number
    } | null>(null)
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

    const runtimeHistory = runtimeSummary?.history || []
    const lastHistoryNodeId = runtimeHistory.length > 0 ? runtimeHistory[runtimeHistory.length - 1]?.nodeId || null : null
    const activeRuntimeNodeId = loading
        ? (runtimeSummary?.currentNodeId || lastHistoryNodeId || data.entryNodeId || null)
        : (runtimeSummary?.currentNodeId || lastHistoryNodeId || null)
    const completedRuntimeNodeIds = new Set(
        runtimeHistory
            .filter((entry) => entry.action.includes('completed') || entry.action.includes('selected') || entry.action.includes('delegated'))
            .map((entry) => entry.nodeId),
    )
    const failedRuntimeNodeIds = new Set(
        runtimeHistory
            .filter((entry) => entry.action.includes('failed'))
            .map((entry) => entry.nodeId),
    )
    const [runtimeGraph, setRuntimeGraph] = useState<{ width: number; height: number; positions: Record<string, { x: number; y: number }> }>({ width: 0, height: 0, positions: {} })
    const runtimeNodesKey = nodes.map((n) => n.id).sort().join(',')
    const runtimeEdgesKey = edges.map((e) => `${e.from}-${e.to}`).sort().join(',')
    useEffect(() => {
        if (nodes.length === 0) {
            setRuntimeGraph({ width: 0, height: 0, positions: {} })
            return
        }
        const miniNodeWidth = 92
        const miniNodeHeight = 34
        const paddingX = 20
        const paddingY = 18
        let cancelled = false
        computeActAutoLayout({
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            nodes: nodes as any,
            edges: edges as any,
        }).then((layout) => {
            if (cancelled) { return }
            const posEntries = Object.entries(layout.positions)
            if (posEntries.length === 0) {
                setRuntimeGraph({ width: 240, height: 80, positions: {} })
                return
            }
            // Scale factor: ratio of mini node to real node
            const sX = miniNodeWidth / ACT_LAYOUT_NODE_WIDTH
            const sY = miniNodeHeight / ACT_LAYOUT_NODE_HEIGHT
            // Map ELK positions to minimap space
            const xs = posEntries.map(([, p]) => p.x)
            const ys = posEntries.map(([, p]) => p.y)
            const minX = Math.min(...xs)
            const minY = Math.min(...ys)
            const positions = Object.fromEntries(
                posEntries.map(([id, p]) => [
                    id,
                    {
                        x: paddingX + (p.x - minX) * sX,
                        y: paddingY + (p.y - minY) * sY,
                    },
                ]),
            )
            const posValues = Object.values(positions)
            const finalWidth = Math.max(240, Math.max(...posValues.map((p) => p.x)) + miniNodeWidth + paddingX)
            const finalHeight = Math.max(80, Math.max(...posValues.map((p) => p.y)) + miniNodeHeight + paddingY)
            setRuntimeGraph({ width: finalWidth, height: finalHeight, positions })
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
        const existingContent = ref?.kind === 'draft'
            ? (() => {
                const attachedDraft = (data.drafts || {})[ref.draftId]
                return typeof attachedDraft?.content === 'string'
                    ? attachedDraft.content
                    : typeof (attachedDraft?.content as { content?: string } | undefined)?.content === 'string'
                        ? (attachedDraft?.content as { content?: string }).content || ''
                        : ''
            })()
            : ''
        setInlineEditor({ kind, performerId, content: existingContent })
    }
    const focusedPerformerPresentation = useMemo(() => (
        focusedPerformerNode
            ? resolvePerformerPresentation(
                focusedPerformerNode,
                buildAssetCardMap(assetInventory),
                buildMcpServerMap(mcpServers),
                data.drafts || {},
            )
            : {
                talAsset: null,
                danceAssets: [],
                mcpServers: [],
                mcpPlaceholders: [],
                mappedMcpPlaceholders: [],
                declaredMcpServerNames: [],
            }
    ), [assetInventory, data.drafts, focusedPerformerNode, mcpServers])
    const focusedRuntimeConfig = useMemo(
        () => focusedPerformerNode ? resolvePerformerRuntimeConfig(focusedPerformerNode) : null,
        [focusedPerformerNode],
    )
    const { data: focusedRuntimeTools } = useRuntimeTools(
        focusedRuntimeConfig?.model || null,
        focusedRuntimeConfig?.mcpServerNames || [],
        !!focusedRuntimeConfig,
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
        if (!data.entryNodeId || nodes.length === 0) return new Set<string>()
        const reachable = new Set<string>()
        const queue = [data.entryNodeId as string]
        reachable.add(data.entryNodeId as string)
        while (queue.length > 0) {
            const current = queue.shift()!
            for (const edge of edges) {
                if (edge.from === current && !reachable.has(edge.to) && edge.to !== '$exit') {
                    reachable.add(edge.to)
                    queue.push(edge.to)
                }
            }
        }
        return new Set(nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id))
    }, [nodes, edges, data.entryNodeId])

    useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            const resize = resizeRef.current
            if (!resize) {
                return
            }

            const nextWidth = Math.max(320, Math.round(resize.startWidth + (event.clientX - resize.startX)))
            const nextHeight = Math.max(220, Math.round(resize.startHeight + (event.clientY - resize.startY)))

            resize.nextWidth = nextWidth
            resize.nextHeight = nextHeight
            setResizeDraft({ width: nextWidth, height: nextHeight })
        }

        const handleUp = () => {
            const resize = resizeRef.current
            if (!resize) {
                return
            }

            resizeRef.current = null
            onResizeFrame?.(resize.nextWidth, resize.nextHeight)
            setResizeDraft(null)
            handleResizeEnd()
            window.setTimeout(() => {
                activateTransformChrome()
            }, 0)
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
            document.body.style.userSelect = ''
        }

        if (resizeRef.current) {
            window.addEventListener('mousemove', handleMove)
            window.addEventListener('mouseup', handleUp)
            document.body.style.userSelect = 'none'
        }

        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
            document.body.style.userSelect = ''
        }
    }, [activateTransformChrome, handleResizeEnd, onResizeFrame])

    const canSendThread = !!threadInput.trim() && !!data.entryNodeId && !loading
    const focusedNodeSemantics = focusedNode && focusedNode.type !== 'parallel'
        ? [
            focusedNode.type,
            focusedNode.sessionPolicy || 'fresh',
            focusedNode.sessionLifetime || 'run',
            focusedNode.sessionModeOverride ? 'node override' : 'act default',
            focusedNode.modelVariant ? `variant:${focusedNode.modelVariant}` : null,
        ].filter(Boolean).join(' · ')
        : focusedNode
            ? `${focusedNode.type} structure node`
            : null

    return (
        <div ref={setNodeRef}>
            <CanvasWindowFrame
                className={`act-area-frame nowheel ${hasFrameChrome ? 'figma-frame--active' : ''} ${isFocused ? 'figma-frame--focused' : ''} ${hasFrameChrome && !showResizeChrome ? 'figma-frame--content-active' : ''} ${showResizeChrome ? 'act-area-frame--transform-active' : ''} ${isOver ? 'act-area-frame--drop' : ''}`}
                width={frameWidth}
                height={frameHeight}
                onPointerDownCapture={handleFramePointerDownCapture}
                chrome={showResizeChrome ? (
                    <button
                        type="button"
                        className="canvas-resize-control act-area-frame__resize-grip"
                        aria-label="Resize act"
                        title="Resize act"
                        onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleResizeStart()
                            resizeRef.current = {
                                startX: event.clientX,
                                startY: event.clientY,
                                startWidth: frameWidth,
                                startHeight: frameHeight,
                                nextWidth: frameWidth,
                                nextHeight: frameHeight,
                            }
                        }}
                    />
                ) : null}
                dragHandleActive={isTransformChromeActive}
                onActivateTransform={activateTransformChrome}
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
                            <span className="figma-frame__name">{data.name}</span>
                        )}
                    </div>
                )}
                headerEnd={(
                    <div className="act-area-frame__meta">
                        {editMode ? (
                            <div className="act-area-frame__header-actions">
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
                                className="figma-edit-select nodrag nowheel"
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
                                                            className="figma-edit-select nodrag nowheel"
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
                                                            className="figma-edit-select nodrag nowheel"
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
                                                            className="figma-edit-select nodrag nowheel"
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
                                                            className="figma-edit-select nodrag nowheel"
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
                                                    className={`figma-edit-workbench__tab ${focusedEditorTab === 'basic' ? 'active' : ''}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setFocusedEditorTab('basic')
                                                    }}
                                                >
                                                    Basic
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`figma-edit-workbench__tab ${focusedEditorTab === 'advanced' ? 'active' : ''}`}
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
                                                    const { kind, performerId, content } = inlineEditor
                                                    const store = useStudioStore.getState()
                                                    const draftId = `${kind}-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                                                    const name = kind === 'tal' ? 'Inline Tal' : 'Inline Dance'
                                                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                                                    store.upsertDraft({
                                                        id: draftId,
                                                        kind,
                                                        name,
                                                        slug,
                                                        description: name,
                                                        tags: [],
                                                        content,
                                                        updatedAt: Date.now(),
                                                    })
                                                    const ref = { kind: 'draft' as const, draftId }
                                                    if (kind === 'tal') {
                                                        store.setPerformerTalRef(performerId, ref)
                                                    } else {
                                                        store.addPerformerDanceRef(performerId, ref)
                                                    }
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
    )
}
