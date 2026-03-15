import type {
    StageAct,
    StageActEdge,
    StageActNode,
    PerformerNode,
} from '../types'
import { unresolvedDeclaredMcpServerNames } from './performers'

export function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function defaultBounds(index = 0) {
    return {
        x: 120 + (index * 40),
        y: 120 + (index * 28),
        width: 480,
        height: 480,
    }
}

function defaultNodePosition(index: number) {
    const column = index % 3
    const row = Math.floor(index / 3)
    return {
        x: 28 + (column * 124),
        y: 56 + (row * 88),
    }
}

export function humanizeActNodeName(value: string) {
    const normalized = value
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
    if (!normalized) {
        return 'Performer'
    }
    return normalized
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function createStageAct(name = 'New Act', index = 0): StageAct {
    return {
        id: makeId('act'),
        name,
        description: '',
        hidden: false,
        executionMode: 'direct',
        bounds: defaultBounds(index),
        entryNodeId: null,
        nodes: [],
        edges: [],
        maxIterations: 10,
    }
}

export function createStageActNode(index: number): StageActNode {
    return {
        id: `worker-${index}`,
        type: 'worker',
        performerId: null,
        modelVariant: null,
        position: defaultNodePosition(index - 1),
    }
}

export function createActNodeBinding(
    performerId: string,
    index: number,
    position?: { x: number; y: number },
): StageActNode {
    const node = createStageActNode(index)
    return {
        ...node,
        performerId,
        position: position || node.position,
    }
}

export function createStageActEdge(): StageActEdge {
    return {
        id: makeId('edge'),
        from: '',
        to: '$exit',
        description: '',
    }
}

export function syncStageActStructure(act: StageAct): StageAct {
    const validNodeIds = new Set(act.nodes.map((node) => node.id))
    const nextEdges = act.edges.filter((edge) => {
        if (!edge.from || !validNodeIds.has(edge.from)) {
            return false
        }
        if (!edge.to || (edge.to !== '$exit' && !validNodeIds.has(edge.to))) {
            return false
        }
        if (edge.from === edge.to) {
            return false
        }
        return true
    })

    const dedupedEdges: StageActEdge[] = []
    const seenKeys = new Set<string>()
    for (const edge of nextEdges) {
        const key = `${edge.from}:${edge.to}`
        if (seenKeys.has(key)) {
            continue
        }
        seenKeys.add(key)
        dedupedEdges.push(edge)
    }

    const entryNodeId = act.entryNodeId && validNodeIds.has(act.entryNodeId)
        ? act.entryNodeId
        : act.nodes[0]?.id || null

    return {
        ...act,
        entryNodeId,
        nodes: act.nodes,
        edges: dedupedEdges,
    }
}

export function collectActPerformerUrns(asset: {
    nodes?: Record<string, any>
}): string[] {
    const urns = new Set<string>()
    for (const node of Object.values(asset.nodes || {})) {
        if (
            node
            && typeof node === 'object'
            && node.type === 'worker'
            && typeof node.performer === 'string'
            && node.performer.trim()
        ) {
            urns.add(node.performer.trim())
        }
    }
    return Array.from(urns)
}

function assetNodeLabel(id: string, label: unknown) {
    return typeof label === 'string' && label.trim()
        ? label.trim()
        : humanizeActNodeName(id)
}

function stageActNodeFromAsset(
    id: string,
    node: Record<string, any>,
    index: number,
    resolvePerformerId: (nodeId: string, performerUrn: string) => string | null,
): StageActNode {
    if (node.type !== 'worker') {
        throw new Error(`Unsupported act node type '${String(node.type)}'. PRD-001 only supports worker nodes.`)
    }

    return {
        id,
        type: 'worker',
        performerId: typeof node.performer === 'string' ? resolvePerformerId(id, node.performer) : null,
        modelVariant: null,
        position: defaultNodePosition(index),
        label: assetNodeLabel(id, node.label),
    }
}

function serializeActNodeForAsset(
    node: StageActNode,
    performers: PerformerNode[],
    author: string | null,
    options?: { savedPerformerUrns?: Iterable<string> },
) {
    if (!node.performerId) {
        throw new Error(`Act node '${node.id}' is missing a performer binding.`)
    }

    const performer = performers.find((item) => item.id === node.performerId)
    const performerUrn = resolvePublishablePerformerUrn(performer, author, {
        savedPerformerUrns: options?.savedPerformerUrns,
    })
    if (!performerUrn) {
        throw new Error(`Act node '${node.id}' does not have a publishable performer reference.`)
    }

    return {
        type: 'worker' as const,
        performer: performerUrn,
    }
}

export function stageActFromAsset(
    asset: {
        name: string
        description?: string
        urn?: string
        entryNode?: string | null
        nodes?: Record<string, any>
        edges?: Array<{ from: string; to: string; description?: string }>
        maxIterations?: number
    },
    resolvePerformerId: (nodeId: string, performerUrn: string) => string | null,
    options?: {
        actId?: string
        index?: number
    },
): StageAct {
    const nodes = Object.entries(asset.nodes || {}).map(([id, node], index: number) =>
        stageActNodeFromAsset(id, node as Record<string, any>, index, resolvePerformerId),
    )

    return {
        id: options?.actId || makeId('act'),
        name: asset.name,
        description: asset.description || '',
        hidden: false,
        bounds: defaultBounds(options?.index || 0),
        entryNodeId: asset.entryNode || nodes[0]?.id || null,
        nodes,
        edges: (asset.edges || []).map((edge) => ({
            id: makeId('edge'),
            from: edge.from,
            to: edge.to,
            description: typeof edge.description === 'string' ? edge.description : '',
        })),
        maxIterations: asset.maxIterations || 10,
        ...(asset.urn ? { meta: { derivedFrom: asset.urn } } : {}),
    }
}

export function resolveActNodeLabel(node: StageActNode, performers: PerformerNode[]): string {
    const performer = node.performerId
        ? performers.find((item) => item.id === node.performerId)
        : null
    if (performer) {
        return performer.name
    }

    return node.label || node.id
}

export function resolvePublishablePerformerUrn(
    performer: PerformerNode | undefined,
    author: string | null,
    options?: {
        savedPerformerUrns?: Iterable<string>
    },
): string | null {
    if (!performer) {
        return null
    }

    if (unresolvedDeclaredMcpServerNames(performer).length > 0) {
        return null
    }

    const publishBindingUrn = performer.meta?.publishBindingUrn
    if (typeof publishBindingUrn === 'string' && publishBindingUrn.startsWith('performer/')) {
        return publishBindingUrn
    }

    if (!author) {
        return null
    }

    const slug = performer.meta?.authoring?.slug
    if (!slug) {
        return null
    }
    const candidate = `performer/@${author.replace(/^@/, '')}/${slug}`
    if (options?.savedPerformerUrns) {
        const savedPerformerUrns = new Set(options.savedPerformerUrns)
        return savedPerformerUrns.has(candidate) ? candidate : null
    }
    return candidate
}

export function buildActAssetPayload(
    act: StageAct,
    performers: PerformerNode[],
    author: string | null,
    options?: {
        name?: string
        description?: string
        tags?: string[]
        savedPerformerUrns?: Iterable<string>
    },
) {
    const nodes: Record<string, Record<string, unknown>> = {}

    for (const node of act.nodes) {
        nodes[node.id] = serializeActNodeForAsset(node, performers, author, {
            savedPerformerUrns: options?.savedPerformerUrns,
        })
    }

    const entryNode = act.entryNodeId || act.nodes[0]?.id
    if (!entryNode) {
        throw new Error('Act must contain at least one node.')
    }

    return {
        name: options?.name?.trim() || act.name,
        description: options?.description?.trim() || act.description || act.name,
        tags: (options?.tags || []).filter((tag) => tag.trim().length > 0),
        entryNode,
        nodes,
        edges: act.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            ...(edge.description ? { description: edge.description } : {}),
        })),
        maxIterations: act.maxIterations,
    }
}
