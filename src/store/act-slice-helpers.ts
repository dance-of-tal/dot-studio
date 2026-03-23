import { nanoid } from 'nanoid'
import type { ActDefinition, AssetCard, WorkspaceAct, WorkspaceActParticipantBinding, ActRelation } from '../types'
import { api } from '../api'
import { parseActAsset } from 'dance-of-tal/contracts'
import { assetUrnDisplayName } from '../lib/asset-urn'
import type { StudioState } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function normalizeSubscriptions<T extends Record<string, unknown> | null | undefined>(subscriptions: T): T {
    if (!subscriptions || typeof subscriptions !== 'object') return subscriptions
    const callboardKeys = Array.isArray(subscriptions.callboardKeys) ? subscriptions.callboardKeys : undefined
    return {
        ...subscriptions,
        ...(callboardKeys ? { callboardKeys } : {}),
    } as T
}


export function fallbackParticipantLabel(performerRef: WorkspaceActParticipantBinding['performerRef']) {
    if (performerRef.kind === 'draft') {
        return performerRef.draftId
    }
    return assetUrnDisplayName(performerRef.urn)
}

export function autoLayoutBindings(bindings: Record<string, WorkspaceActParticipantBinding>) {
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
    asset: AssetCard,
    dimensions: { width: number; height: number },
) {
    const id = nanoid(12)
    const center = get().canvasCenter

    // CONTRACT_RULES: validate through canonical contract parser at import boundary
    const raw = asset as unknown as Record<string, unknown>
    const canonicalPayload = {
        $schema: asset.schema || 'https://schemas.danceoftal.com/assets/act.v1.json',
        kind: 'act' as const,
        urn: asset.urn || `act/@local/${asset.name || 'untitled'}`,
        description: asset.description,
        payload: {
            actRules: Array.isArray(raw.actRules) ? raw.actRules : undefined,
            participants: asset.participants || [],
            relations: asset.relations || [],
        },
    }
    const validated = parseActAsset(canonicalPayload)

    const participants: Record<string, WorkspaceActParticipantBinding> = {}
    const idMapping: Record<string, string> = {}
    const nodes = validated.payload.participants

    for (const node of nodes) {
        const baseKey = node.key
        let newKey = baseKey
        const existingKeys = Object.keys(participants)
        if (existingKeys.includes(newKey)) {
            let i = 2
            while (existingKeys.includes(`${baseKey} (${i})`)) i++
            newKey = `${baseKey} (${i})`
        }
        idMapping[baseKey] = newKey

        participants[newKey] = {
            performerRef: { kind: 'registry', urn: node.performer },
            subscriptions: normalizeSubscriptions(node.subscriptions),
            position: { x: Object.keys(participants).length * 300, y: 100 },
        }
    }

    const rawRelations = validated.payload.relations
    const relations: ActRelation[] = rawRelations.map((relation) => ({
        id: nanoid(8),
        between: [
            idMapping[relation.between[0]] || relation.between[0],
            idMapping[relation.between[1]] || relation.between[1],
        ] as [string, string],
        direction: relation.direction,
        name: relation.name,
        description: relation.description,
    }))

    const nextAct = {
        id,
        name: asset.name || `Act ${get().acts.length + 1}`,
        description: asset.description,
        actRules: validated.payload.actRules,
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
        workspaceDirty: true,
    }))
}

function buildServerActDefinition(act: WorkspaceAct): ActDefinition {
    return {
        id: act.id,
        name: act.name,
        description: act.description,
        actRules: act.actRules,
        participants: Object.fromEntries(
            Object.entries(act.participants).map(([key, binding]) => [key, {
                performerRef: binding.performerRef,
                subscriptions: normalizeSubscriptions(binding.subscriptions),
            }]),
        ),
        relations: act.relations,
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
                    status: thread.status,
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
                status: thread.status,
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
