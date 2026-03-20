import { nanoid } from 'nanoid'
import type { StageActParticipantBinding, ActRelation } from '../types'
import { api } from '../api'
import type { StudioState } from './types'

type SetState = (partial: any) => void
type GetState = () => StudioState

export function normalizeSubscriptions(subscriptions: any) {
    if (!subscriptions) return subscriptions
    return {
        ...subscriptions,
        ...(subscriptions.callboardKeys ? { callboardKeys: subscriptions.callboardKeys } : {}),
    }
}

export function normalizeRelationPermissions(permissions: any) {
    if (!permissions) return permissions
    return {
        ...permissions,
        ...(permissions.callboardKeys ? { callboardKeys: permissions.callboardKeys } : {}),
    }
}

export function fallbackParticipantLabel(performerRef: StageActParticipantBinding['performerRef']) {
    if (performerRef.kind === 'draft') {
        return performerRef.draftId
    }
    return performerRef.urn.split('/').pop() || performerRef.urn
}

export function autoLayoutBindings(bindings: Record<string, StageActParticipantBinding>) {
    const entries = Object.entries(bindings)
    if (entries.length === 0) return bindings

    const columns = entries.length <= 3 ? entries.length : Math.min(3, Math.ceil(Math.sqrt(entries.length)))
    const gapX = 260
    const gapY = 180

    return Object.fromEntries(entries.map(([key, binding], index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        return [key, {
            ...binding,
            position: {
                x: 40 + col * gapX,
                y: 120 + row * gapY,
            },
        }]
    }))
}

export function importActFromAssetImpl(
    get: GetState,
    set: SetState,
    asset: any,
    dimensions: { width: number; height: number },
) {
    const id = nanoid(12)
    const center = get().canvasCenter

    const participants: Record<string, StageActParticipantBinding> = {}
    const idMapping: Record<string, string> = {}

    const nodes: any[] = Array.isArray(asset.participants)
        ? asset.participants
        : typeof asset.participants === 'object' && asset.participants
            ? Object.values(asset.participants)
            : []

    for (const node of nodes) {
        const newKey = nanoid(8)
        const oldId = node.id || node.name || newKey
        idMapping[oldId] = newKey

        const performerRef = node.performerRef || (node.urn
            ? { kind: 'registry' as const, urn: node.urn }
            : node.draftId
                ? { kind: 'draft' as const, draftId: node.draftId }
                : { kind: 'draft' as const, draftId: '' })

        participants[newKey] = {
            performerRef,
            activeDanceIds: node.activeDanceIds,
            subscriptions: normalizeSubscriptions(node.subscriptions),
            position: { x: Object.keys(participants).length * 300, y: 100 },
        }
    }

    const rawRelations: any[] = Array.isArray(asset.relations) ? asset.relations : []
    const relations: ActRelation[] = rawRelations.map((relation: any) => ({
        id: nanoid(8),
        between: [
            idMapping[relation.between?.[0]] || relation.between?.[0] || '',
            idMapping[relation.between?.[1]] || relation.between?.[1] || '',
        ] as [string, string],
        direction: relation.direction || 'both' as const,
        name: relation.name || `rel_${nanoid(6)}`,
        description: relation.description,
        permissions: normalizeRelationPermissions(relation.permissions),
        maxCalls: relation.maxCalls ?? 10,
        timeout: relation.timeout ?? 300,
    }))

    const nextAct = {
        id,
        name: asset.name || `Act ${get().acts.length + 1}`,
        description: asset.description,
        actRules: asset.actRules,
        participants,
        relations,
        position: { x: (center?.x ?? 400) - dimensions.width / 2, y: center?.y ?? 300 },
        width: dimensions.width,
        height: dimensions.height,
        createdAt: Date.now(),
        meta: {
            derivedFrom: asset.urn || null,
            authoring: {
                description: asset.description || '',
            },
        },
    }

    set((state: StudioState) => ({
        acts: [...state.acts, nextAct],
        selectedActId: id,
        actEditorState: null,
        stageDirty: true,
    }))
}

function buildServerActDefinition(act: any) {
    return {
        id: act.id,
        name: act.name,
        description: act.description,
        actRules: act.actRules,
        participants: Object.fromEntries(
            Object.entries(act.participants).map(([key, binding]: [string, any]) => [key, {
                performerRef: binding.performerRef,
                activeDanceIds: binding.activeDanceIds,
                subscriptions: normalizeSubscriptions(binding.subscriptions),
            }]),
        ),
        relations: act.relations.map((relation: any) => ({
            ...relation,
            permissions: normalizeRelationPermissions(relation.permissions),
        })),
    }
}

export async function createActThreadImpl(get: GetState, set: SetState, actId: string) {
    const act = get().acts.find((entry) => entry.id === actId)
    const actDefinition = act ? buildServerActDefinition(act) : undefined
    const result = await api.actRuntime.createThread(actId, actDefinition)
    const thread = result.thread
    set((state: StudioState) => ({
        actThreads: {
            ...state.actThreads,
            [actId]: [
                ...(state.actThreads[actId] || []),
                {
                    id: thread.id,
                    actId: thread.actId,
                    status: thread.status as any,
                    participantSessions: {},
                    createdAt: thread.createdAt,
                },
            ],
        },
        selectedActId: actId,
        actEditorState: state.actEditorState?.actId === actId ? state.actEditorState : null,
        activeThreadId: thread.id,
        activeThreadParticipantKey: null,
    }))
    return thread.id
}

export async function loadActThreadsImpl(_get: GetState, set: SetState, actId: string) {
    const result = await api.actRuntime.listThreads(actId)
    set((state: StudioState) => ({
        actThreads: {
            ...state.actThreads,
            [actId]: result.threads.map((thread) => ({
                id: thread.id,
                actId: thread.actId,
                status: thread.status as any,
                participantSessions: thread.participantSessions || {},
                createdAt: thread.createdAt,
            })),
        },
        activeThreadId: state.selectedActId === actId
            ? ((state.actThreads[actId] || []).some((thread) => thread.id === state.activeThreadId)
                ? state.activeThreadId
                : null)
            : state.activeThreadId,
    }))
}
