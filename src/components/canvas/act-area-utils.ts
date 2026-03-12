import { computeActAutoLayout, ACT_LAYOUT_NODE_WIDTH, ACT_LAYOUT_NODE_HEIGHT } from '../../lib/act-layout'
import { useStudioStore } from '../../store'
import { makeId } from '../../lib/acts'

// ── Types ──────────────────────────────────────────────

export type ActAreaNodeView = {
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

export type ActAreaEdgeView = {
    id: string
    from: string
    to: string
    role?: 'branch'
    condition?: 'always' | 'on_success' | 'on_fail'
}

export type ActAreaPerformerDetail = {
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

export type ActAreaPerformerMap = Record<string, import('../../types').PerformerNode>

export type ActAreaMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
}

export type ActRuntimeHistoryEntry = {
    nodeId: string
    nodeType: 'worker' | 'orchestrator' | 'parallel'
    action: string
    timestamp: number
}

export type ActRuntimeSummary = {
    currentNodeId?: string | null
    history?: ActRuntimeHistoryEntry[]
}

export type RuntimeGraphState = {
    width: number
    height: number
    positions: Record<string, { x: number; y: number }>
}

export type InlineEditorState = {
    kind: 'tal' | 'dance'
    performerId: string
    content: string
}

// ── Utility Functions ──────────────────────────────────

export function edgePath(from: ActAreaNodeView | undefined, to: ActAreaNodeView | undefined) {
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

export function previewEdgePath(from: ActAreaNodeView | undefined, point: { x: number; y: number } | null) {
    if (!from || !point) {
        return null
    }

    const startX = from.position.x + ACT_LAYOUT_NODE_WIDTH
    const startY = from.position.y + (ACT_LAYOUT_NODE_HEIGHT / 2)
    const delta = Math.max(40, Math.abs(point.x - startX) * 0.5)
    return `M ${startX} ${startY} C ${startX + delta} ${startY}, ${point.x - delta} ${point.y}, ${point.x} ${point.y}`
}

export function buildRuntimeState(
    runtimeSummary: ActRuntimeSummary | null,
    loading: boolean,
    entryNodeId: string | null | undefined,
) {
    const runtimeHistory = runtimeSummary?.history || []
    const lastHistoryNodeId = runtimeHistory.length > 0 ? runtimeHistory[runtimeHistory.length - 1]?.nodeId || null : null
    const activeRuntimeNodeId = loading
        ? (runtimeSummary?.currentNodeId || lastHistoryNodeId || entryNodeId || null)
        : (runtimeSummary?.currentNodeId || lastHistoryNodeId || null)

    return {
        runtimeHistory,
        activeRuntimeNodeId,
        completedRuntimeNodeIds: new Set(
            runtimeHistory
                .filter((entry) => entry.action.includes('completed') || entry.action.includes('selected') || entry.action.includes('delegated'))
                .map((entry) => entry.nodeId),
        ),
        failedRuntimeNodeIds: new Set(
            runtimeHistory
                .filter((entry) => entry.action.includes('failed'))
                .map((entry) => entry.nodeId),
        ),
    }
}

export async function computeRuntimeGraphState(
    nodes: ActAreaNodeView[],
    edges: ActAreaEdgeView[],
): Promise<RuntimeGraphState> {
    if (nodes.length === 0) {
        return { width: 0, height: 0, positions: {} }
    }

    const miniNodeWidth = 92
    const miniNodeHeight = 34
    const paddingX = 20
    const paddingY = 18

    const layout = await computeActAutoLayout({
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        nodes: nodes as any,
        edges: edges as any,
    })
    const posEntries = Object.entries(layout.positions)
    if (posEntries.length === 0) {
        return { width: 240, height: 80, positions: {} }
    }

    const sX = miniNodeWidth / ACT_LAYOUT_NODE_WIDTH
    const sY = miniNodeHeight / ACT_LAYOUT_NODE_HEIGHT
    const xs = posEntries.map(([, p]) => p.x)
    const ys = posEntries.map(([, p]) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const positions = Object.fromEntries(
        posEntries.map(([nodeId, position]) => [
            nodeId,
            {
                x: paddingX + (position.x - minX) * sX,
                y: paddingY + (position.y - minY) * sY,
            },
        ]),
    )
    const posValues = Object.values(positions)
    return {
        width: Math.max(240, Math.max(...posValues.map((position) => position.x)) + miniNodeWidth + paddingX),
        height: Math.max(80, Math.max(...posValues.map((position) => position.y)) + miniNodeHeight + paddingY),
        positions,
    }
}

export function findOrphanedNodeIds(
    nodes: ActAreaNodeView[],
    edges: ActAreaEdgeView[],
    entryNodeId: string | null | undefined,
) {
    if (!entryNodeId || nodes.length === 0) return new Set<string>()

    const reachable = new Set<string>()
    const queue = [entryNodeId]
    reachable.add(entryNodeId)
    while (queue.length > 0) {
        const current = queue.shift()!
        for (const edge of edges) {
            if (edge.from === current && !reachable.has(edge.to) && edge.to !== '$exit') {
                reachable.add(edge.to)
                queue.push(edge.to)
            }
        }
    }
    return new Set(nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id))
}

export function buildFocusedNodeSemantics(focusedNode: ActAreaNodeView | null) {
    if (!focusedNode) {
        return null
    }
    if (focusedNode.type === 'parallel') {
        return `${focusedNode.type} structure node`
    }
    return [
        focusedNode.type,
        focusedNode.sessionPolicy || 'fresh',
        focusedNode.sessionLifetime || 'run',
        focusedNode.sessionModeOverride ? 'node override' : 'act default',
        focusedNode.modelVariant ? `variant:${focusedNode.modelVariant}` : null,
    ].filter(Boolean).join(' · ')
}

export function resolveInlineEditorContent(
    ref: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined,
    drafts: Record<string, { content?: unknown }>,
) {
    if (ref?.kind !== 'draft') {
        return ''
    }
    const attachedDraft = drafts[ref.draftId]
    return typeof attachedDraft?.content === 'string'
        ? attachedDraft.content
        : typeof (attachedDraft?.content as { content?: string } | undefined)?.content === 'string'
            ? (attachedDraft?.content as { content?: string }).content || ''
            : ''
}

export function saveInlineEditorDraft(inlineEditor: InlineEditorState) {
    const store = useStudioStore.getState()
    const draftId = makeId(`${inlineEditor.kind}-draft`)
    const name = inlineEditor.kind === 'tal' ? 'Inline Tal' : 'Inline Dance'
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    store.upsertDraft({
        id: draftId,
        kind: inlineEditor.kind,
        name,
        slug,
        description: name,
        tags: [],
        content: inlineEditor.content,
        updatedAt: Date.now(),
    })
    const ref = { kind: 'draft' as const, draftId }
    if (inlineEditor.kind === 'tal') {
        store.setPerformerTalRef(inlineEditor.performerId, ref)
    } else {
        store.addPerformerDanceRef(inlineEditor.performerId, ref)
    }
}
