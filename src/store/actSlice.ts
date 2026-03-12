// Act-related store actions extracted from workspaceSlice.ts
// These actions manage Act CRUD, node/edge manipulation, and Act run recording.

import type { StudioState } from './types'
import { api } from '../api'
import { showToast } from '../lib/toast'
import {
    createPerformerNode,
    createPerformerNodeFromAsset,
    normalizeAssetMcpForStudio,
    normalizeAssetModelForStudio,
} from '../lib/performers'
import {
    collectActPerformerUrns,
    coerceStageActNodeType,
    createActNodeBinding,
    createStageAct,
    createStageActEdge,
    createStageActNode,
    humanizeActNodeName,
    normalizeActSessionMode,
    syncStageActStructure,
    stageActFromAsset,
} from '../lib/acts'
import { projectMcpServerNames } from '../../shared/project-mcp'

// ── Shared helpers ──────────────────────────────────────

function performerNameFromUrn(urn: string) {
    return urn.split('/').pop() || 'Performer'
}

function parseAssetUrn(urn: string) {
    const [kind, author, name] = urn.split('/')
    return {
        kind,
        author: author?.replace(/^@/, '') || '',
        name: name || '',
    }
}

function performerNodePositionWithinAct(
    performer: { position: { x: number; y: number } },
    act: { bounds: { x: number; y: number; width: number; height: number } },
) {
    const relativeX = performer.position.x - act.bounds.x
    const relativeY = performer.position.y - act.bounds.y
    return {
        x: Math.max(24, Math.min(relativeX, Math.max(24, act.bounds.width - 132))),
        y: Math.max(48, Math.min(relativeY, Math.max(48, act.bounds.height - 72))),
    }
}

function normalizeActNodePosition(
    act: { bounds: { width: number; height: number } },
    position: { x: number; y: number },
) {
    return {
        x: Math.max(24, Math.min(position.x, Math.max(24, act.bounds.width - 132))),
        y: Math.max(48, Math.min(position.y, Math.max(48, act.bounds.height - 72))),
    }
}

function normalizeNodeSessionOverride(
    act: { sessionMode?: 'default' | 'all_nodes_thread' },
    node: any,
    patch: Record<string, unknown>,
) {
    const nextNode = {
        ...node,
        ...patch,
    }

    if (node.type === 'parallel') {
        return nextNode
    }

    if (typeof patch.sessionModeOverride === 'boolean') {
        return {
            ...nextNode,
            sessionModeOverride: patch.sessionModeOverride,
        }
    }

    if (!('sessionPolicy' in patch) && !('sessionLifetime' in patch)) {
        return nextNode
    }
    const shouldInherit = normalizeActSessionMode(act.sessionMode) === 'all_nodes_thread'
        && nextNode.sessionPolicy === 'node'
        && nextNode.sessionLifetime === 'thread'

    return {
        ...nextNode,
        sessionModeOverride: shouldInherit ? false : true,
    }
}

export function pruneActOwnedPerformers(performers: any[], acts: any[]) {
    const actIds = new Set(acts.map((act) => act.id))
    const referencedPerformerIds = new Set<string>()
    for (const act of acts) {
        for (const node of act.nodes || []) {
            if (node.type !== 'parallel' && node.performerId) {
                referencedPerformerIds.add(node.performerId)
            }
        }
    }

    return performers.filter((performer) => {
        if (performer.scope !== 'act-owned') {
            return true
        }
        return !!performer.ownerActId
            && actIds.has(performer.ownerActId)
            && referencedPerformerIds.has(performer.id)
    })
}

// ── Act slice factory ───────────────────────────────────

export function createActActions(
    set: (fn: (state: StudioState) => Partial<StudioState>) => void,
    get: () => StudioState,
    performerIdCounter: { value: number },
) {
    return {
        addAct: (name = `Act ${get().acts.length + 1}`) => set((s) => {
            const act = createStageAct(name, s.acts.length)
            return {
                acts: [...s.acts, act],
                isAssetLibraryOpen: true,
                selectedActId: act.id,
                selectedPerformerId: null,
                selectedPerformerSessionId: null,
                selectedActSessionId: null,
                inspectorFocus: null,
                stageDirty: true,
            }
        }),

        importActFromAsset: async (asset: any) => {
            const state = get()
            const actSeed = createStageAct(asset.name || `Act ${state.acts.length + 1}`)
            const runtimeModels = await api.models.list().catch(() => [])
            const projectConfig = await api.config.getProject().catch(() => ({ config: {} }))
            const projectMcpNames = projectMcpServerNames(projectConfig.config)
            const performerUrns = collectActPerformerUrns(asset)
            const performerAssets = await Promise.all(performerUrns.map(async (performerUrn) => {
                const parsed = parseAssetUrn(performerUrn)
                if (parsed.kind !== 'performer' || !parsed.author || !parsed.name) {
                    return {
                        urn: performerUrn,
                        name: performerNameFromUrn(performerUrn),
                    }
                }
                try {
                    const detail = await api.assets.get('performer', parsed.author, parsed.name)
                    return {
                        ...detail,
                        urn: performerUrn,
                    }
                } catch {
                    return {
                        urn: performerUrn,
                        name: performerNameFromUrn(performerUrn),
                    }
                }
            }))

            const performerAssetByUrn = new Map(
                performerAssets
                    .map((performerAsset) => [performerAsset.urn, performerAsset] as const)
                    .filter((entry): entry is [string, typeof performerAssets[number]] => !!entry[0]),
            )
            const importedPerformers: ReturnType<typeof createPerformerNodeFromAsset>[] = []
            const performerIdByNodeId = new Map<string, string>()
            const assetNodes = Object.entries(asset.nodes || {})

            for (const [nodeId, rawNode] of assetNodes) {
                const node = rawNode as Record<string, any>
                if (
                    !node
                    || typeof node !== 'object'
                    || (node.type !== 'worker' && node.type !== 'orchestrator')
                    || typeof node.performer !== 'string'
                    || !node.performer.trim()
                ) {
                    continue
                }

                const performerAsset = performerAssetByUrn.get(node.performer.trim()) || {
                    urn: node.performer.trim(),
                    name: performerNameFromUrn(node.performer.trim()),
                }
                const studioPerformerAsset = normalizeAssetMcpForStudio(
                    normalizeAssetModelForStudio(performerAsset, runtimeModels),
                    projectMcpNames,
                )
                const performerName = typeof node.label === 'string' && node.label.trim()
                    ? node.label.trim()
                    : humanizeActNodeName(nodeId)

                performerIdCounter.value += 1
                const performer = createPerformerNodeFromAsset({
                    id: `performer-${performerIdCounter.value}`,
                    asset: {
                        ...studioPerformerAsset,
                        name: performerName,
                    },
                    x: actSeed.bounds.x + 32,
                    y: actSeed.bounds.y + 56,
                    scope: 'act-owned',
                    ownerActId: actSeed.id,
                    hidden: true,
                })

                importedPerformers.push(performer)
                performerIdByNodeId.set(nodeId, performer.id)
            }

            const hydratedAct = stageActFromAsset(
                asset,
                (nodeId) => performerIdByNodeId.get(nodeId) || null,
                { actId: actSeed.id, index: state.acts.length },
            )
            const unresolvedModelPlaceholders = Array.from(new Set(
                importedPerformers
                    .filter((performer) => performer.modelPlaceholder && !performer.model)
                    .map((performer) => `${performer.modelPlaceholder?.provider}/${performer.modelPlaceholder?.modelId}`),
            ))

            set((s) => ({
                performers: [...s.performers, ...importedPerformers],
                acts: [...s.acts, hydratedAct],
                selectedActId: hydratedAct.id,
                selectedPerformerId: null,
                selectedPerformerSessionId: null,
                selectedActSessionId: null,
                inspectorFocus: null,
                stageDirty: true,
            }))
            if (unresolvedModelPlaceholders.length > 0) {
                showToast(
                    `Act imported. ${unresolvedModelPlaceholders.length} model placeholder${unresolvedModelPlaceholders.length === 1 ? '' : 's'} need review: ${unresolvedModelPlaceholders.join(', ')}.`,
                    'warning',
                    {
                        title: 'Model placeholders added',
                        dedupeKey: `act-import-model:${hydratedAct.id}`,
                        durationMs: 6500,
                    },
                )
            }
        },

        removeAct: (actId: string) => set((s) => {
            const acts = s.acts.filter((act) => act.id !== actId)
            const nextActSessions = s.actSessions.filter((session) => session.actId !== actId)
            const removedSessionIds = new Set(
                s.actSessions
                    .filter((session) => session.actId === actId)
                    .map((session) => session.id),
            )
            const nextActChats = Object.fromEntries(
                Object.entries(s.actChats).filter(([sessionId]) => !removedSessionIds.has(sessionId)),
            )
            const nextActPerformerChats = Object.fromEntries(
                Object.entries(s.actPerformerChats).filter(([sessionId]) => !removedSessionIds.has(sessionId)),
            )
            const nextActPerformerBindings = Object.fromEntries(
                Object.entries(s.actPerformerBindings).filter(([sessionId]) => !removedSessionIds.has(sessionId)),
            )
            const nextActSessionMap = Object.fromEntries(
                Object.entries(s.actSessionMap).filter(([currentActId]) => currentActId !== actId),
            )
            return {
                acts,
                performers: pruneActOwnedPerformers(s.performers, acts),
                actSessions: nextActSessions,
                actChats: nextActChats,
                actPerformerChats: nextActPerformerChats,
                actPerformerBindings: nextActPerformerBindings,
                actSessionMap: nextActSessionMap,
                selectedActSessionId: s.selectedActSessionId && removedSessionIds.has(s.selectedActSessionId)
                    ? null
                    : s.selectedActSessionId,
                selectedActId: s.selectedActId === actId ? null : s.selectedActId,
                inspectorFocus: s.selectedActId === actId ? null : s.inspectorFocus,
                editingTarget: s.editingTarget?.type === 'act' && s.editingTarget.id === actId ? null : s.editingTarget,
                stageDirty: true,
            }
        }),

        updateActMeta: (actId: string, patch: any) => set((s) => ({
            acts: s.acts.map((act) => act.id === actId ? {
                ...act,
                ...patch,
            } : act),
            stageDirty: true,
        })),

        updateActAuthoringMeta: (actId: string, patch: { slug?: string; description?: string; tags?: string[] }) => set((s) => ({
            acts: s.acts.map((act) => (
                act.id === actId
                    ? {
                        ...act,
                        meta: {
                            ...act.meta,
                            authoring: {
                                ...(act.meta?.authoring || {}),
                                ...patch,
                            },
                        },
                    }
                    : act
            )),
            stageDirty: true,
        })),

        updateActBounds: (actId: string, bounds: any) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                return {
                    ...act,
                    bounds: {
                        ...act.bounds,
                        ...bounds,
                    },
                }
            }),
            stageDirty: true,
        })),

        addActNode: (actId: string, type: any) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                const nextNode = createStageActNode(type, act.nodes.length + 1)
                return syncStageActStructure({
                    ...act,
                    nodes: [...act.nodes, nextNode],
                    entryNodeId: act.entryNodeId || nextNode.id,
                })
            }),
            inspectorFocus: (() => {
                const act = s.acts.find((item) => item.id === actId)
                const nextNode = act ? createStageActNode(type, act.nodes.length + 1) : null
                return nextNode ? `act-node:${nextNode.id}` : s.inspectorFocus
            })(),
            stageDirty: true,
        })),

        addPerformerAssetToAct: (actId: string, asset: any, position?: { x: number; y: number }) => {
            performerIdCounter.value += 1
            const performerId = `performer-${performerIdCounter.value}`
            set((s) => {
                const act = s.acts.find((item) => item.id === actId)
                const performer = createPerformerNodeFromAsset({
                    id: performerId,
                    asset,
                    x: (act?.bounds.x || 120) + 32,
                    y: (act?.bounds.y || 120) + 56,
                    scope: 'act-owned',
                    ownerActId: actId,
                    hidden: true,
                })
                let nextNodeId: string | null = null
                return {
                    performers: [...s.performers, performer],
                    acts: s.acts.map((item) => {
                        if (item.id !== actId) {
                            return item
                        }
                        const nextNode = createActNodeBinding(
                            performerId,
                            'worker',
                            item.nodes.length + 1,
                            position ? normalizeActNodePosition(item, position) : performerNodePositionWithinAct(performer, item),
                        )
                        nextNodeId = nextNode.id
                        return syncStageActStructure({
                            ...item,
                            nodes: [...item.nodes, nextNode],
                            entryNodeId: item.entryNodeId || nextNode.id,
                        })
                    }),
                    selectedActId: actId,
                    selectedPerformerId: performerId,
                    selectedPerformerSessionId: null,
                    selectedActSessionId: null,
                    inspectorFocus: nextNodeId ? `act-node:${nextNodeId}` : null,
                    stageDirty: true,
                }
            })
        },

        createActOwnedPerformerForNode: (actId: string, nodeId: string, asset?: any) => {
            performerIdCounter.value += 1
            const performerId = `performer-${performerIdCounter.value}`
            let created = false
            set((s) => {
                const act = s.acts.find((item) => item.id === actId)
                const node = act?.nodes.find((item: any) => item.id === nodeId)
                if (!act || !node || node.type === 'parallel') {
                    return {}
                }

                const performer = asset
                    ? createPerformerNodeFromAsset({
                        id: performerId,
                        asset: {
                            name: node.label || humanizeActNodeName(node.id),
                            urn: asset.urn || null,
                            talUrn: asset.talUrn || null,
                            danceUrns: asset.danceUrns || [],
                            model: asset.model || null,
                            modelPlaceholder: asset.modelPlaceholder || null,
                            mcpServerNames: asset.mcpServerNames || [],
                            mcpConfig: asset.mcpConfig || null,
                        },
                        x: act.bounds.x + node.position.x,
                        y: act.bounds.y + node.position.y,
                        scope: 'act-owned',
                        ownerActId: actId,
                        hidden: true,
                    })
                    : createPerformerNode({
                        id: performerId,
                        name: asset?.name || `${act.name} Performer ${act.nodes.filter((item: any) => item.type !== 'parallel').length + 1}`,
                        x: act.bounds.x + node.position.x,
                        y: act.bounds.y + node.position.y,
                        scope: 'act-owned',
                        ownerActId: actId,
                        hidden: true,
                    })
                created = true

                return {
                    performers: [...s.performers, performer],
                    acts: s.acts.map((item) => {
                        if (item.id !== actId) {
                            return item
                        }
                        return syncStageActStructure({
                            ...item,
                            nodes: item.nodes.map((currentNode: any) => (
                                currentNode.id === nodeId && currentNode.type !== 'parallel'
                                    ? { ...currentNode, performerId }
                                    : currentNode
                            )),
                        })
                    }),
                    selectedActId: actId,
                    selectedPerformerId: performerId,
                    selectedPerformerSessionId: null,
                    selectedActSessionId: null,
                    inspectorFocus: `act-node:${nodeId}`,
                    stageDirty: true,
                }
            })
            return created ? performerId : null
        },

        updateActNode: (actId: string, nodeId: string, patch: any) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                const requestedNodeId = typeof patch.id === 'string' && patch.id.trim() ? patch.id.trim() : nodeId
                const renamedNodeId = requestedNodeId !== nodeId && act.nodes.some((node: any) => node.id === requestedNodeId)
                    ? nodeId
                    : requestedNodeId
                const nextAct = {
                    ...act,
                    entryNodeId: act.entryNodeId === nodeId ? renamedNodeId : act.entryNodeId,
                    edges: act.edges.map((edge: any) => ({
                        ...edge,
                        from: edge.from === nodeId ? renamedNodeId : edge.from,
                        to: edge.to === nodeId ? renamedNodeId : edge.to,
                    })),
                    nodes: act.nodes.map((node: any) => {
                        if (node.id !== nodeId) {
                            return node
                        }
                        return normalizeNodeSessionOverride(act, { ...node, id: renamedNodeId }, patch) as typeof node
                    }),
                }
                return syncStageActStructure(nextAct)
            }),
            inspectorFocus: (() => {
                if (s.inspectorFocus !== `act-node:${nodeId}`) {
                    return s.inspectorFocus
                }
                const requestedNodeId = typeof patch.id === 'string' && patch.id.trim() ? patch.id.trim() : nodeId
                const act = s.acts.find((item) => item.id === actId)
                const renamedNodeId = requestedNodeId !== nodeId && act?.nodes.some((node: any) => node.id === requestedNodeId)
                    ? nodeId
                    : requestedNodeId
                return `act-node:${renamedNodeId}`
            })(),
            performers: pruneActOwnedPerformers(
                s.performers,
                s.acts.map((act) => {
                    if (act.id !== actId) {
                        return act
                    }
                    const requestedNodeId = typeof patch.id === 'string' && patch.id.trim() ? patch.id.trim() : nodeId
                    const renamedNodeId = requestedNodeId !== nodeId && act.nodes.some((node: any) => node.id === requestedNodeId)
                        ? nodeId
                        : requestedNodeId
                    return syncStageActStructure({
                        ...act,
                        entryNodeId: act.entryNodeId === nodeId ? renamedNodeId : act.entryNodeId,
                        edges: act.edges.map((edge: any) => ({
                            ...edge,
                            from: edge.from === nodeId ? renamedNodeId : edge.from,
                            to: edge.to === nodeId ? renamedNodeId : edge.to,
                        })),
                        nodes: act.nodes.map((node: any) => (
                            node.id === nodeId
                                ? normalizeNodeSessionOverride(act, { ...node, id: renamedNodeId }, patch) as typeof node
                                : node
                        )),
                    })
                }),
            ),
            stageDirty: true,
        })),

        updateActNodePosition: (actId: string, nodeId: string, x: number, y: number) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                return {
                    ...act,
                    nodes: act.nodes.map((node: any) => (
                        node.id === nodeId
                            ? { ...node, position: normalizeActNodePosition(act, { x, y }) }
                            : node
                    )),
                }
            }),
            stageDirty: true,
        })),

        applyActAutoLayout: (
            actId: string,
            positions: Record<string, { x: number; y: number }>,
            bounds?: { x?: number; y?: number; width?: number; height?: number },
        ) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                return {
                    ...act,
                    bounds: bounds
                        ? {
                            ...act.bounds,
                            ...Object.fromEntries(
                                Object.entries(bounds).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value]),
                            ),
                        }
                        : act.bounds,
                    nodes: act.nodes.map((node: any) => {
                        const position = positions[node.id]
                        if (!position) {
                            return node
                        }
                        return {
                            ...node,
                            position: {
                                x: Math.round(position.x),
                                y: Math.round(position.y),
                            },
                        }
                    }),
                }
            }),
            stageDirty: true,
        })),

        setActNodeType: (actId: string, nodeId: string, type: any) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                return syncStageActStructure({
                    ...act,
                    nodes: act.nodes.map((node: any) => node.id === nodeId ? coerceStageActNodeType(node, type) : node),
                })
            }),
            performers: pruneActOwnedPerformers(
                s.performers,
                s.acts.map((act) => {
                    if (act.id !== actId) {
                        return act
                    }
                    return syncStageActStructure({
                        ...act,
                        nodes: act.nodes.map((node: any) => node.id === nodeId ? coerceStageActNodeType(node, type) : node),
                    })
                }),
            ),
            stageDirty: true,
        })),

        removeActNode: (actId: string, nodeId: string) => set((s) => {
            const acts = s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                const nodes = act.nodes.filter((node: any) => node.id !== nodeId)
                const edges = act.edges.filter((edge: any) => edge.from !== nodeId && edge.to !== nodeId)
                const entryNodeId = act.entryNodeId === nodeId ? (nodes[0]?.id || null) : act.entryNodeId
                return syncStageActStructure({
                    ...act,
                    nodes,
                    edges,
                    entryNodeId,
                })
            })
            return {
                acts,
                performers: pruneActOwnedPerformers(s.performers, acts),
                inspectorFocus: s.inspectorFocus === `act-node:${nodeId}` ? null : s.inspectorFocus,
                stageDirty: true,
            }
        }),

        addActEdge: (actId: string, from?: string, to?: string) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                const fallbackFrom = from || act.nodes[0]?.id || ''
                const fallbackTo = to || act.nodes.find((node: any) => node.id !== fallbackFrom)?.id || '$exit'
                const sourceNode = act.nodes.find((node: any) => node.id === fallbackFrom)
                if (from && to) {
                    if (from === to || act.edges.some((edge: any) => edge.from === from && edge.to === to)) {
                        return act
                    }
                }
                return syncStageActStructure({
                    ...act,
                    edges: [
                        ...act.edges,
                        {
                            ...createStageActEdge(),
                            from: fallbackFrom,
                            to: fallbackTo,
                            ...(sourceNode?.type === 'parallel' ? { role: 'branch' as const, condition: undefined } : {}),
                        },
                    ],
                })
            }),
            stageDirty: true,
        })),

        updateActEdge: (actId: string, edgeId: string, patch: any) => set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) {
                    return act
                }
                const currentEdge = act.edges.find((edge: any) => edge.id === edgeId)
                const nextFrom = typeof patch.from === 'string' ? patch.from : currentEdge?.from
                const sourceNode = act.nodes.find((node: any) => node.id === nextFrom)
                return syncStageActStructure({
                    ...act,
                    edges: act.edges.map((edge: any) => {
                        if (edge.id !== edgeId) {
                            return edge
                        }
                        const nextEdge = { ...edge, ...patch }
                        if (sourceNode?.type === 'parallel' && nextEdge.role !== 'branch') {
                            nextEdge.role = 'branch'
                        }
                        if (sourceNode?.type !== 'parallel' && nextEdge.role === 'branch') {
                            delete nextEdge.role
                        }
                        if (nextEdge.role === 'branch') {
                            delete nextEdge.condition
                        }
                        return nextEdge
                    }),
                })
            }),
            stageDirty: true,
        })),

        removeActEdge: (actId: string, edgeId: string) => set((s) => ({
            acts: s.acts.map((act) => act.id === actId
                ? syncStageActStructure({ ...act, edges: act.edges.filter((edge: any) => edge.id !== edgeId) })
                : act),
            stageDirty: true,
        })),
    }
}
