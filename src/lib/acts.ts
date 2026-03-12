import type {
    ActSessionMode,
    ActSessionPolicy,
    ActSessionLifetime,
    StageAct,
    StageActEdge,
    StageActNode,
    ActNodeType,
    PerformerNode,
} from '../types'
import { unresolvedDeclaredMcpServerNames } from './performers'

export function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function defaultSessionPolicy(type: Extract<ActNodeType, 'worker' | 'orchestrator'>): ActSessionPolicy {
    return type === 'orchestrator' ? 'node' : 'fresh'
}

function defaultSessionLifetime(type: Extract<ActNodeType, 'worker' | 'orchestrator'>): ActSessionLifetime {
    return type === 'orchestrator' ? 'thread' : 'run'
}

export function defaultActSessionMode(): ActSessionMode {
    return 'all_nodes_thread'
}

export function normalizeActSessionMode(mode: ActSessionMode | null | undefined): ActSessionMode {
    return mode === 'default' ? 'default' : defaultActSessionMode()
}

export function resolveEffectiveActNodeSession(
    act: Pick<StageAct, 'sessionMode'>,
    node: Extract<StageActNode, { type: 'worker' | 'orchestrator' }>,
): { policy: ActSessionPolicy; lifetime: ActSessionLifetime; inheritedFromAct: boolean } {
    if (node.sessionModeOverride || normalizeActSessionMode(act.sessionMode) === 'default') {
        return {
            policy: node.sessionPolicy,
            lifetime: node.sessionLifetime,
            inheritedFromAct: false,
        }
    }

    return {
        policy: 'node',
        lifetime: 'thread',
        inheritedFromAct: true,
    }
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
        return 'Node'
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
        sessionMode: defaultActSessionMode(),
        bounds: defaultBounds(index),
        entryNodeId: null,
        nodes: [],
        edges: [],
        maxIterations: 10,
    }
}

export function createStageActNode(type: ActNodeType, index: number): StageActNode {
    const id = `${type}-${index}`
    if (type === 'worker') {
        return {
            id,
            type,
            performerId: null,
            modelVariant: null,
            position: defaultNodePosition(index - 1),
            sessionPolicy: defaultSessionPolicy(type),
            sessionLifetime: defaultSessionLifetime(type),
            sessionModeOverride: false,
        }
    }
    if (type === 'orchestrator') {
        return {
            id,
            type,
            performerId: null,
            modelVariant: null,
            position: defaultNodePosition(index - 1),
            maxDelegations: 3,
            sessionPolicy: defaultSessionPolicy(type),
            sessionLifetime: defaultSessionLifetime(type),
            sessionModeOverride: false,
        }
    }
    return {
        id,
        type,
        position: defaultNodePosition(index - 1),
        join: 'all',
    }
}

export function createActNodeBinding(
    performerId: string,
    type: Extract<ActNodeType, 'worker' | 'orchestrator'>,
    index: number,
    position?: { x: number; y: number },
): StageActNode {
    const node = createStageActNode(type, index)
    if (node.type === 'parallel') {
        return node
    }
    return {
        ...node,
        performerId,
        modelVariant: null,
        position: position || node.position,
    }
}

export function coerceStageActNodeType(node: StageActNode, type: ActNodeType): StageActNode {
    if (type === 'worker') {
        return {
            id: node.id,
            type,
            performerId: 'performerId' in node ? node.performerId : null,
            modelVariant: 'modelVariant' in node ? node.modelVariant || null : null,
            position: 'position' in node ? node.position : defaultNodePosition(0),
            sessionPolicy: 'sessionPolicy' in node ? node.sessionPolicy : defaultSessionPolicy(type),
            sessionLifetime: 'sessionLifetime' in node ? node.sessionLifetime : defaultSessionLifetime(type),
            sessionModeOverride: 'sessionModeOverride' in node ? !!node.sessionModeOverride : false,
        }
    }
    if (type === 'orchestrator') {
        return {
            id: node.id,
            type,
            performerId: 'performerId' in node ? node.performerId : null,
            modelVariant: 'modelVariant' in node ? node.modelVariant || null : null,
            position: 'position' in node ? node.position : defaultNodePosition(0),
            maxDelegations: 'maxDelegations' in node ? node.maxDelegations : 3,
            sessionPolicy: 'sessionPolicy' in node ? node.sessionPolicy : defaultSessionPolicy(type),
            sessionLifetime: 'sessionLifetime' in node ? node.sessionLifetime : defaultSessionLifetime(type),
            sessionModeOverride: 'sessionModeOverride' in node ? !!node.sessionModeOverride : false,
        }
    }
    return {
        id: node.id,
        type,
        position: 'position' in node ? node.position : defaultNodePosition(0),
        join: 'join' in node ? node.join : 'all',
    }
}

export function createStageActEdge(): StageActEdge {
    return {
        id: makeId('edge'),
        from: '',
        to: '$exit',
        condition: 'always',
    }
}

export function getActOutgoingEdges(act: Pick<StageAct, 'edges'>, nodeId: string) {
    return act.edges.filter((edge) => edge.from === nodeId)
}

export function getOrchestratorTargets(act: Pick<StageAct, 'edges'>, nodeId: string) {
    return getActOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role !== 'branch')
        .map((edge) => edge.to)
}

export function getParallelBranchTargets(act: Pick<StageAct, 'edges'>, nodeId: string) {
    return getActOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role === 'branch' && edge.to !== '$exit')
        .map((edge) => edge.to)
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
        const key = `${edge.from}:${edge.to}:${edge.role || 'flow'}:${edge.condition || 'always'}`
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
        sessionMode: normalizeActSessionMode(act.sessionMode),
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
            && (node.type === 'worker' || node.type === 'orchestrator')
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
    const position = defaultNodePosition(index)

    if (node.type === 'orchestrator') {
        return {
            id,
            type: 'orchestrator',
            performerId: typeof node.performer === 'string' ? resolvePerformerId(id, node.performer) : null,
            modelVariant: null,
            position,
            maxDelegations: typeof node.maxDelegations === 'number' ? node.maxDelegations : 3,
            sessionPolicy: defaultSessionPolicy('orchestrator'),
            sessionLifetime: defaultSessionLifetime('orchestrator'),
            sessionModeOverride: false,
            label: assetNodeLabel(id, node.label),
        }
    }

    if (node.type === 'parallel') {
        return {
            id,
            type: 'parallel',
            position,
            join: node.join === 'any' ? 'any' : 'all',
            label: assetNodeLabel(id, node.label),
        }
    }

    return {
        id,
        type: 'worker',
        performerId: typeof node.performer === 'string' ? resolvePerformerId(id, node.performer) : null,
        modelVariant: null,
        position,
        sessionPolicy: defaultSessionPolicy('worker'),
        sessionLifetime: defaultSessionLifetime('worker'),
        sessionModeOverride: false,
        label: assetNodeLabel(id, node.label),
    }
}

function serializeActNodeForAsset(
    node: StageActNode,
    performers: PerformerNode[],
    author: string | null,
    options?: { savedPerformerUrns?: Iterable<string> },
) {
    if (node.type === 'parallel') {
        return {
            type: 'parallel' as const,
            join: node.join,
        }
    }

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

    if (node.type === 'orchestrator') {
        return {
            type: 'orchestrator' as const,
            performer: performerUrn,
            ...(typeof node.maxDelegations === 'number' ? { maxDelegations: node.maxDelegations } : {}),
        }
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
        edges?: Array<{ from: string; to: string; role?: 'branch'; condition?: 'always' | 'on_success' | 'on_fail' }>
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
        sessionMode: defaultActSessionMode(),
        bounds: defaultBounds(options?.index || 0),
        entryNodeId: asset.entryNode || nodes[0]?.id || null,
        nodes,
        edges: (asset.edges || []).map((edge) => ({
            id: makeId('edge'),
            from: edge.from,
            to: edge.to,
            ...(edge.role ? { role: edge.role } : {}),
            condition: edge.condition,
        })),
        maxIterations: asset.maxIterations || 10,
        ...(asset.urn ? { meta: { derivedFrom: asset.urn } } : {}),
    }
}

export function resolveActNodeLabel(node: StageActNode, performers: PerformerNode[]): string {
    if (node.type === 'parallel') {
        return `${node.id} (parallel)`
    }

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
            ...(edge.role ? { role: edge.role } : {}),
            ...(edge.condition ? { condition: edge.condition } : {}),
        })),
        maxIterations: act.maxIterations,
    }
}
