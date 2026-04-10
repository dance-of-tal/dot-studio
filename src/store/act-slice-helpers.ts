import { nanoid } from 'nanoid'
import type {
    ActDefinition,
    ActParticipantSessionStatus,
    AssetCard,
    AssetRef,
    PerformerNode,
    WorkspaceAct,
    WorkspaceActParticipantBinding,
    ActRelation,
} from '../types'
import { api } from '../api'
import { parseActAsset } from 'dance-of-tal/contracts'
import { assetUrnDisplayName, parseStudioAssetUrn } from '../lib/asset-urn'
import { resolvePerformerFromActBinding } from '../lib/act-participants'
import { resolvePreferredActThreadId } from '../lib/act-threads'
import {
    createPerformerNodeFromAsset,
    normalizeAssetMcpForStudio,
    normalizeAssetModelForStudio,
    PERFORMER_DEFAULT_HEIGHT,
    PERFORMER_DEFAULT_WIDTH,
} from '../lib/performers'
import { showToast } from '../lib/toast'
import { buildActParticipantChatKey, parseActParticipantChatKey } from '../../shared/chat-targets'
import { mcpServerNamesFromConfig } from '../../shared/mcp-catalog'
import type { ActEditorState, StudioState } from './types'
import { clearChatSessionView, registerSessionBinding, syncSessionSnapshot } from './session'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

const actRuntimeSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

type ActThreadRuntimeSnapshot = {
    id: string
    actId: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>
    participantStatuses?: Record<string, ActParticipantSessionStatus>
    createdAt: number
}

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

export function sameActParticipantRef(left: AssetRef, right: AssetRef) {
    return (left.kind === 'draft' && right.kind === 'draft' && left.draftId === right.draftId)
        || (left.kind === 'registry' && right.kind === 'registry' && left.urn === right.urn)
}

export function performerNodeToActRef(performer: PerformerNode): AssetRef {
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    if (!derivedFrom) {
        return { kind: 'draft', draftId: performer.id }
    }
    if (derivedFrom.startsWith('draft:')) {
        return { kind: 'draft', draftId: derivedFrom.slice('draft:'.length) }
    }
    return { kind: 'registry', urn: derivedFrom }
}

export function resolveActParticipantName(
    performers: PerformerNode[],
    binding: WorkspaceActParticipantBinding | null | undefined,
    fallbackKey: string,
) {
    const performer = resolvePerformerFromActBinding(performers, binding)
    return performer?.name || resolveBindingDisplayName(binding, fallbackKey)
}

export function findExistingParticipantKey(
    act: WorkspaceAct,
    performerRef: AssetRef,
) {
    const existing = Object.entries(act.participants).find(([, binding]) => sameActParticipantRef(binding.performerRef, performerRef))
    return existing?.[0] || null
}

export function createActParticipantBinding(params: {
    act: WorkspaceAct
    performers: PerformerNode[]
    performerRef: AssetRef
}) {
    const { act, performers, performerRef } = params
    const participantCount = Object.keys(act.participants).length
    const displayName = performerRef.kind === 'registry'
        ? performers.find((performer) => performer.meta?.derivedFrom === performerRef.urn)?.name
            || assetUrnDisplayName(performerRef.urn)
            || `Participant ${participantCount + 1}`
        : performers.find((performer) => performer.id === performerRef.draftId)?.name
            || `Participant ${participantCount + 1}`

    return {
        key: createActParticipantKey(),
        binding: {
            performerRef,
            displayName,
            position: { x: participantCount * 300, y: 100 },
        } satisfies WorkspaceActParticipantBinding,
    }
}

export function buildActSelectionState(state: StudioState, actId: string) {
    return {
        selectedActId: actId,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        actEditorState: state.actEditorState?.actId === actId ? state.actEditorState : null,
    }
}

export function buildActEditorSelectionState(
    state: StudioState,
    actId: string,
    actEditorState: ActEditorState,
) {
    return {
        ...buildActSelectionState(state, actId),
        actEditorState,
    }
}

export function createActEditorState(
    actId: string,
    mode: ActEditorState['mode'],
    options: { participantKey?: string | null; relationId?: string | null } = {},
): ActEditorState {
    return {
        actId,
        mode,
        participantKey: options.participantKey ?? null,
        relationId: options.relationId ?? null,
    }
}

export function resolveActEditorStateAfterRelationRemoval(
    actEditorState: ActEditorState | null,
    actId: string,
    relationId: string,
    nextParticipants: Record<string, unknown>,
) {
    if (actEditorState?.actId !== actId) {
        return actEditorState
    }

    if (
        actEditorState.mode === 'participant'
        && actEditorState.participantKey
        && !nextParticipants[actEditorState.participantKey]
    ) {
        return createActEditorState(actId, 'act')
    }

    if (
        actEditorState.mode === 'relation'
        && actEditorState.relationId === relationId
    ) {
        return createActEditorState(actId, 'act')
    }

    return actEditorState
}

function resolveValidActParticipantSelection(
    state: StudioState,
    actId: string,
    participantKey: string | null,
) {
    if (!participantKey) {
        return null
    }

    const act = state.acts.find((entry) => entry.id === actId)
    return act?.participants[participantKey] ? participantKey : null
}

function resolveThreadParticipantSelection(
    state: StudioState,
    actId: string,
    threadId: string | null,
    participantKey?: string | null,
) {
    if (!threadId) {
        return null
    }

    const requestedParticipantKey = participantKey === undefined
        ? state.activeThreadParticipantKey
        : participantKey

    return resolveValidActParticipantSelection(state, actId, requestedParticipantKey)
}

export function buildSelectActState(state: StudioState, actId: string | null) {
    if (actId === null) {
        return {
            selectedActId: null,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: null,
        }
    }

    const nextThreads = state.actThreads[actId] || []
    const nextActiveThreadId = resolvePreferredActThreadId(nextThreads, state.activeThreadId)
    const shouldPreserveParticipantSelection = nextActiveThreadId === state.activeThreadId

    return {
        ...buildActSelectionState(state, actId),
        activeThreadId: nextActiveThreadId,
        activeThreadParticipantKey: shouldPreserveParticipantSelection
            ? resolveValidActParticipantSelection(state, actId, state.activeThreadParticipantKey)
            : null,
    }
}

export function resolveSelectedActThreadState(
    state: StudioState,
    actId: string,
    threads: Array<{ id: string; createdAt: number }>,
    preferredThreadId: string | null = state.activeThreadId,
) {
    if (state.selectedActId !== actId) {
        return {
            activeThreadId: state.activeThreadId,
            activeThreadParticipantKey: state.activeThreadParticipantKey,
        }
    }

    const nextActiveThreadId = resolvePreferredActThreadId(threads, preferredThreadId)
    return {
        activeThreadId: nextActiveThreadId,
        activeThreadParticipantKey: resolveThreadParticipantSelection(state, actId, nextActiveThreadId),
    }
}

export function buildActThreadSelectionState(
    state: StudioState,
    actId: string,
    threadId: string | null,
    participantKey?: string | null,
) {
    return {
        ...buildActSelectionState(state, actId),
        activeThreadId: threadId,
        activeThreadParticipantKey: resolveThreadParticipantSelection(state, actId, threadId, participantKey),
    }
}

export function buildDeletedActThreadState(
    state: StudioState,
    actId: string,
    threadId: string,
) {
    const remainingThreads = (state.actThreads[actId] || []).filter((thread) => thread.id !== threadId)

    return {
        actThreads: { ...state.actThreads, [actId]: remainingThreads },
        ...resolveSelectedActThreadState(
            state,
            actId,
            remainingThreads,
            state.selectedActId === actId && state.activeThreadId === threadId
                ? null
                : state.activeThreadId,
        ),
    }
}

export function collectRemovedActParticipantChatKeys(
    state: Pick<StudioState, 'chatKeyToSession'>,
    actId: string,
    nextThreadIds: Set<string>,
    authoritativeSessions: Record<string, string>,
) {
    return Object.keys(state.chatKeyToSession).filter((key) => {
        const parsed = parseActParticipantChatKey(key)
        if (!parsed || parsed.actId !== actId) {
            return false
        }

        return !nextThreadIds.has(parsed.threadId) || !(key in authoritativeSessions)
    })
}

export function listActThreadChatKeys(
    state: Pick<StudioState, 'chatKeyToSession'>,
    actId: string,
    threadId: string,
) {
    return Object.keys(state.chatKeyToSession).filter((key) => {
        const parsed = parseActParticipantChatKey(key)
        return parsed?.actId === actId && parsed.threadId === threadId
    })
}

function buildActThreadState(thread: ActThreadRuntimeSnapshot) {
    return {
        id: thread.id,
        actId: thread.actId,
        status: thread.status,
        participantSessions: thread.participantSessions || {},
        participantStatuses: thread.participantStatuses || {},
        createdAt: thread.createdAt,
    }
}

function transitionedToSettledStatus(
    previous: ActParticipantSessionStatus | undefined,
    next: ActParticipantSessionStatus | undefined,
) {
    const wasActive = previous?.type === 'busy' || previous?.type === 'retry'
    const isSettled = next?.type === 'idle' || next?.type === 'error'
    return wasActive && isSettled
}

export async function applyAuthoritativeActThreads(
    get: GetState,
    set: SetState,
    actId: string,
    threads: ActThreadRuntimeSnapshot[],
) {
    const previousThreads = get().actThreads[actId] || []
    const previousById = new Map(previousThreads.map((thread) => [thread.id, thread]))
    const nextThreadIds = new Set(threads.map((thread) => thread.id))
    const authoritativeSessions: Record<string, string> = {}
    const sessionsToFetch = new Set<string>()
    const removedChatKeys: string[] = []

    set((state: StudioState) => {
        removedChatKeys.push(
            ...collectRemovedActParticipantChatKeys(state, actId, nextThreadIds, Object.fromEntries(
                threads.flatMap((thread) => Object.entries(thread.participantSessions || {}).map(([participantKey, sessionId]) => [
                    buildActParticipantChatKey(actId, thread.id, participantKey),
                    sessionId,
                ])),
            )),
        )

        for (const thread of threads) {
            const previousThread = previousById.get(thread.id)
            for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
                if (!sessionId) continue
                const chatKey = buildActParticipantChatKey(actId, thread.id, participantKey)
                authoritativeSessions[chatKey] = sessionId

                const previousSessionId = previousThread?.participantSessions?.[participantKey]
                const previousStatus = previousThread?.participantStatuses?.[participantKey]
                const nextStatus = thread.participantStatuses?.[participantKey]
                const shouldFetch = state.chatKeyToSession[chatKey] !== sessionId
                    || !(state.seMessages[sessionId]?.length)
                    || transitionedToSettledStatus(previousStatus, nextStatus)
                    || previousSessionId !== sessionId
                if (shouldFetch) {
                    sessionsToFetch.add(chatKey)
                }
            }
        }

        return {
            actThreads: {
                ...state.actThreads,
                [actId]: threads.map(buildActThreadState),
            },
            ...resolveSelectedActThreadState(state, actId, threads),
        }
    })

    for (const chatKey of removedChatKeys) {
        clearChatSessionView(get, chatKey)
    }

    for (const [chatKey, sessionId] of Object.entries(authoritativeSessions)) {
        registerSessionBinding(set, get, chatKey, sessionId)
        const parsed = parseActParticipantChatKey(chatKey)
        if (!parsed) continue
        const thread = threads.find((entry) => entry.id === parsed.threadId)
        const participantStatus = thread?.participantStatuses?.[parsed.participantKey]
        if (!participantStatus) continue
        get().setSessionStatus(sessionId, participantStatus)
        if (participantStatus.type === 'idle' || participantStatus.type === 'error') {
            get().setSessionLoading(sessionId, false)
        }
    }

    for (const chatKey of sessionsToFetch) {
        const sessionId = authoritativeSessions[chatKey]
        if (!sessionId) continue
        syncSessionSnapshot(set, get, chatKey, sessionId).catch(() => {
            // Session may have been deleted or compacted — ignore background refresh failure.
        })
    }
}

function resolveParticipantDescription(
    binding: WorkspaceActParticipantBinding,
    performers: StudioState['performers'],
) {
    const performer = resolvePerformerFromActBinding(performers, binding)
    const description = performer?.meta?.authoring?.description?.trim()
    return description ? description : undefined
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

async function loadPerformerAssetDetailByUrn(urn: string): Promise<AssetCard | null> {
    const parsed = parseStudioAssetUrn(urn)
    if (!parsed || parsed.kind !== 'performer') {
        return null
    }

    const author = parsed.author.replace(/^@/, '')
    try {
        return await api.assets.get('performer', author, parsed.path) as AssetCard
    } catch {
        try {
            return await api.assets.getRegistry('performer', author, parsed.path) as AssetCard
        } catch {
            return null
        }
    }
}

async function buildMaterializedRegistryPerformers(
    get: GetState,
    participants: Record<string, WorkspaceActParticipantBinding>,
    center: { x: number; y: number } | null,
) {
    const existingPerformers = get().performers
    const seeds: Array<{
        key: string
        urn: string
        binding: WorkspaceActParticipantBinding
    }> = []

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.performerRef.kind !== 'registry') continue

        const urn = binding.performerRef.urn
        const alreadyExists = existingPerformers.some((p) => p.meta?.derivedFrom === urn)
        if (alreadyExists) continue

        if (seeds.some((seed) => seed.urn === urn)) continue
        seeds.push({ key, urn, binding })
    }

    if (seeds.length === 0) {
        return []
    }

    const [runtimeModels, globalConfig, performerAssets] = await Promise.all([
        api.models.list().catch(() => []),
        api.config.getGlobal().catch(() => ({})),
        Promise.all(seeds.map(async (seed) => loadPerformerAssetDetailByUrn(seed.urn))),
    ])
    const availableMcpServerNames = mcpServerNamesFromConfig(globalConfig)

    return seeds.map((seed, index) => {
        const detail = performerAssets[index]
        const x = (center?.x ?? 400) + index * 340
        const y = (center?.y ?? 300) + 350

        if (detail) {
            const normalized = normalizeAssetMcpForStudio(
                normalizeAssetModelForStudio(detail, runtimeModels),
                availableMcpServerNames,
            )
            const node = createPerformerNodeFromAsset({
                id: nanoid(12),
                asset: {
                    ...normalized,
                    name: resolveBindingDisplayName(seed.binding, seed.key),
                },
                x,
                y,
                hidden: true,
            })
            const authoring = {
                ...(detail.slug ? { slug: detail.slug } : {}),
                ...(detail.description ? { description: detail.description } : {}),
                ...(Array.isArray(detail.tags) ? { tags: detail.tags } : {}),
            }
            return {
                ...node,
                meta: {
                    ...node.meta,
                    ...(Object.keys(authoring).length > 0 ? { authoring } : {}),
                },
            }
        }

        return {
            id: nanoid(12),
            name: resolveBindingDisplayName(seed.binding, seed.key),
            position: { x, y },
            width: PERFORMER_DEFAULT_WIDTH,
            height: PERFORMER_DEFAULT_HEIGHT,
            scope: 'shared' as const,
            model: null,
            talRef: null,
            danceRefs: [],
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
            hidden: true,
            meta: {
                derivedFrom: seed.urn,
                authoring: {
                    description: `Auto-created for Act participant "${seed.key}" (${seed.urn}). Configure a model to make this participant runnable.`,
                },
            },
        }
    })
}

export async function importActFromAssetImpl(
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

    const materializedPerformers = await buildMaterializedRegistryPerformers(get, participants, center)

    set((state: StudioState) => ({
        acts: [...state.acts, nextAct],
        performers: [...state.performers, ...materializedPerformers],
        selectedActId: id,
        actEditorState: null,
        workspaceDirty: true,
    }))
    get().recordStudioChange({
        kind: 'act',
        actIds: [id],
        performerIds: materializedPerformers.map((performer) => performer.id),
    })
}

export function buildServerActDefinition(act: WorkspaceAct, performers: StudioState['performers'] = []): ActDefinition {
    return {
        id: act.id,
        name: act.name,
        description: act.description,
        actRules: act.actRules,
        participants: Object.fromEntries(
            Object.entries(act.participants).map(([key, binding]) => [key, {
                performerRef: binding.performerRef,
                displayName: binding.displayName,
                description: resolveParticipantDescription(binding, performers),
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
                    await api.actRuntime.syncDefinition(actId, buildServerActDefinition(latestAct, latestState.performers) as unknown as Record<string, unknown>)
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
    const actDefinition = act ? buildServerActDefinition(act, get().performers) : undefined
    // Save workspace before thread creation so auto-wake reads latest performer config
    await get().saveWorkspace()
    const result = await api.actRuntime.createThread(actId, actDefinition as unknown as Record<string, unknown> | undefined)
    const thread = result.thread

    // Set active thread immediately for responsiveness
    set((state) => buildActThreadSelectionState(state, actId, thread.id))

    // Reload threads from server to get authoritative list (avoids duplication)
    await loadActThreadsImpl(get, set, actId)

    return thread.id
}

export async function loadActThreadsImpl(get: GetState, set: SetState, actId: string) {
    const result = await api.actRuntime.listThreads(actId)
    await applyAuthoritativeActThreads(get, set, actId, result.threads)
}
