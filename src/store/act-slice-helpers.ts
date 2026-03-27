import { nanoid } from 'nanoid'
import type { ActDefinition, AssetCard, WorkspaceAct, WorkspaceActParticipantBinding, ActRelation } from '../types'
import { api } from '../api'
import { parseActAsset } from 'dance-of-tal/contracts'
import { assetUrnDisplayName } from '../lib/asset-urn'
import { showToast } from '../lib/toast'
import type { StudioState } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

const actRuntimeSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function createActParticipantKey() {
    return `participant-${nanoid(8)}`
}

export function resolveBindingDisplayName(binding: WorkspaceActParticipantBinding | null | undefined, fallbackKey: string) {
    return binding?.displayName?.trim() || fallbackKey
}

export function mapParticipantDisplayNames(act: WorkspaceAct) {
    return Object.fromEntries(
        Object.entries(act.participants).map(([key, binding]) => [key, resolveBindingDisplayName(binding, key)]),
    )
}

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
        const newKey = createActParticipantKey()
        idMapping[baseKey] = newKey
    }

    for (const node of nodes) {
        const baseKey = node.key
        const newKey = idMapping[baseKey] || createActParticipantKey()

        participants[newKey] = {
            performerRef: { kind: 'registry', urn: node.performer },
            displayName: baseKey,
            subscriptions: normalizeSubscriptions({
                ...node.subscriptions,
                ...(node.subscriptions?.messagesFrom
                    ? {
                        messagesFrom: node.subscriptions.messagesFrom.map((entry) => idMapping[entry] || entry),
                    }
                    : {}),
            }),
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

    // WS3: Auto-materialize hidden performer nodes for registry-bound participants.
    // sendActMessage resolves performer by meta.derivedFrom === urn.
    // Without a local performer node, registry-bound participants can't run.
    const existingPerformers = get().performers
    const materializedPerformers: import('../types').PerformerNode[] = []

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.performerRef.kind !== 'registry') continue

        const urn = binding.performerRef.urn
        // Skip if a local performer already exists for this URN
        const alreadyExists = existingPerformers.some(
            (p) => p.meta?.derivedFrom === urn,
        )
        if (alreadyExists) continue

        // Also skip if we already materialized one for this same URN in this import
        if (materializedPerformers.some((p) => p.meta?.derivedFrom === urn)) continue

        const performerNode: import('../types').PerformerNode = {
            id: nanoid(12),
            name: resolveBindingDisplayName(binding, key),
            position: {
                x: (center?.x ?? 400) + materializedPerformers.length * 340,
                y: (center?.y ?? 300) + 350,
            },
            width: 320,
            height: 400,
            scope: 'shared',
            model: null,
            talRef: null,
            danceRefs: [],
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
            danceDeliveryMode: 'auto',
            executionMode: 'direct',
            hidden: true,
            meta: {
                derivedFrom: urn,
                authoring: {
                    description: `Auto-created for Act participant "${key}" (${urn}). Configure a model to make this participant runnable.`,
                },
            },
        }
        materializedPerformers.push(performerNode)
    }

    set((state: StudioState) => ({
        acts: [...state.acts, nextAct],
        performers: [...state.performers, ...materializedPerformers],
        selectedActId: id,
        actEditorState: null,
        workspaceDirty: true,
    }))
}

export function buildServerActDefinition(act: WorkspaceAct): ActDefinition {
    return {
        id: act.id,
        name: act.name,
        description: act.description,
        actRules: act.actRules,
        participants: Object.fromEntries(
            Object.entries(act.participants).map(([key, binding]) => [key, {
                performerRef: binding.performerRef,
                displayName: binding.displayName,
                subscriptions: normalizeSubscriptions(binding.subscriptions),
            }]),
        ),
        relations: act.relations,
        safety: act.safety,
    }
}

function hasLiveRuntimeThreads(state: StudioState, actId: string) {
    return (state.actThreads[actId] || []).some((thread) => thread.status === 'active' || thread.status === 'idle')
}

export function scheduleActRuntimeSync(get: GetState, set: SetState, actId: string, delay = 300) {
    const existing = actRuntimeSyncTimers.get(actId)
    if (existing) {
        clearTimeout(existing)
    }

    actRuntimeSyncTimers.set(actId, setTimeout(() => {
        actRuntimeSyncTimers.delete(actId)
        const currentState = get()
        const act = currentState.acts.find((entry) => entry.id === actId)
        if (!act || !hasLiveRuntimeThreads(currentState, actId)) {
            return
        }

        void currentState.saveWorkspace()
            .catch((error) => {
                console.warn('[act-sync] Failed to persist workspace before runtime sync', error)
            })
            .then(async () => {
                const latestState = get()
                const latestAct = latestState.acts.find((entry) => entry.id === actId)
                if (!latestAct || !hasLiveRuntimeThreads(latestState, actId)) {
                    return
                }

                try {
                    await api.actRuntime.syncDefinition(actId, buildServerActDefinition(latestAct) as Record<string, unknown>)
                    await loadActThreadsImpl(get, set, actId)
                } catch (error) {
                    console.error('[act-sync] Failed to sync act runtime definition', error)
                    showToast('Studio could not sync the running Act threads.', 'error', {
                        title: 'Act sync failed',
                        dedupeKey: `act:sync:${actId}`,
                    })
                }
            })
    }, delay))
}

export async function createActThreadImpl(get: GetState, set: SetState, actId: string) {
    const act = get().acts.find((entry) => entry.id === actId)
    const actDefinition = act ? buildServerActDefinition(act) : undefined
    // Save workspace before thread creation so auto-wake reads latest performer config
    await get().saveWorkspace()
    const result = await api.actRuntime.createThread(actId, actDefinition as Record<string, unknown> | undefined)
    const thread = result.thread

    // Set active thread immediately for responsiveness
    set({
        selectedActId: actId,
        activeThreadId: thread.id,
        activeThreadParticipantKey: null,
    })

    // Reload threads from server to get authoritative list (avoids duplication)
    await loadActThreadsImpl(get, set, actId)

    return thread.id
}

export async function loadActThreadsImpl(get: GetState, set: SetState, actId: string) {
    const result = await api.actRuntime.listThreads(actId)

    const nextThreadIds = new Set(result.threads.map((thread) => thread.id))
    const authoritativeSessions: Record<string, string> = {}
    for (const thread of result.threads) {
        for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
            if (!sessionId) continue
            authoritativeSessions[`act:${actId}:thread:${thread.id}:participant:${participantKey}`] = sessionId
        }
    }

    const sessionsToFetch: Record<string, string> = {}
    const removedChatKeys: string[] = []
    set((state: StudioState) => {
        const sessionMap = { ...state.sessionMap }
        const chats = { ...state.chats }
        const actThreadPrefix = `act:${actId}:thread:`

        for (const key of Object.keys(sessionMap)) {
            if (!key.startsWith(actThreadPrefix)) continue
            const match = key.match(/^act:[^:]+:thread:([^:]+):participant:/)
            const threadId = match?.[1] || null
            if (!threadId || !nextThreadIds.has(threadId) || !(key in authoritativeSessions)) {
                delete sessionMap[key]
                delete chats[key]
                removedChatKeys.push(key)
            }
        }

        for (const [chatKey, sessionId] of Object.entries(authoritativeSessions)) {
            if (sessionMap[chatKey] !== sessionId) {
                sessionMap[chatKey] = sessionId
                delete chats[chatKey]
                sessionsToFetch[chatKey] = sessionId
            } else if (!chats[chatKey]) {
                sessionsToFetch[chatKey] = sessionId
            }
        }

        let nextActiveThreadParticipantKey = state.activeThreadParticipantKey
        if (state.selectedActId === actId && state.activeThreadParticipantKey) {
            const selectedAct = state.acts.find((entry) => entry.id === actId)
            if (!selectedAct?.participants[state.activeThreadParticipantKey]) {
                nextActiveThreadParticipantKey = null
            }
        }

        return {
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
            sessionMap,
            chats,
            activeThreadId: state.selectedActId === actId
                ? (result.threads.some((thread) => thread.id === state.activeThreadId)
                    ? state.activeThreadId
                    : null)
                : state.activeThreadId,
            activeThreadParticipantKey: nextActiveThreadParticipantKey,
        }
    })

    for (const chatKey of removedChatKeys) {
        get().unregisterBinding(chatKey)
    }
    for (const [chatKey, sessionId] of Object.entries(authoritativeSessions)) {
        get().registerBinding(chatKey, sessionId)
        if (!get().seEntities[sessionId]) {
            get().upsertSession({ id: sessionId, status: { type: 'idle' } })
        }
    }

    // Background-fetch messages for restored or changed sessions so participant tabs show chat history
    if (Object.keys(sessionsToFetch).length > 0) {
        const { mapSessionMessagesToChatMessages } = await import('../lib/chat-messages')
        for (const [chatKey, sessionId] of Object.entries(sessionsToFetch)) {
            api.chat.messages(sessionId).then((response) => {
                const messages = Array.isArray(response) ? response : (response.messages || [])
                const mapped = mapSessionMessagesToChatMessages(messages)
                if (mapped.length > 0) {
                    set((state: StudioState) => ({
                        chats: {
                            ...state.chats,
                            [chatKey]: mapped,
                        },
                    }))
                    get().setSessionMessages(sessionId, mapped)
                }
            }).catch(() => {
                // Session may have been deleted — ignore
            })
        }
    }
}
