import { describeChatTarget } from '../../shared/chat-targets'
import { resolvePerformerRuntimeConfig } from '../lib/performers'
import type { AssetRef, PerformerNode, WorkspaceActParticipantBinding } from '../types'
import { draftIdsFromRuntimeRefs } from './runtime-change-policy'
import type { StudioState } from './types'

type RuntimeExecutionTarget = {
    performerId?: string | null
    actId?: string | null
    runtimeConfig: {
        talRef: AssetRef | null
        danceRefs: AssetRef[]
    }
}

type RuntimeDependencyScope = {
    performerIds: string[]
    actIds: string[]
    draftIds: string[]
}

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

function performerByRegistryUrn(performers: PerformerNode[], urn: string) {
    return performers.find((performer) => performer.meta?.derivedFrom === urn) || null
}

function performerByDraftId(performers: PerformerNode[], draftId: string) {
    return performers.find((performer) => (
        performer.id === draftId
        || performer.meta?.derivedFrom === `draft:${draftId}`
    )) || null
}

function resolveBindingPerformer(state: StudioState, binding: WorkspaceActParticipantBinding | undefined) {
    if (!binding) {
        return null
    }

    if (binding.performerRef.kind === 'draft') {
        return performerByDraftId(state.performers, binding.performerRef.draftId)
    }

    return performerByRegistryUrn(state.performers, binding.performerRef.urn)
}

function createRuntimeDependencyScope(
    performerIds: Array<string | null | undefined>,
    actIds: Array<string | null | undefined>,
    runtimeConfig: RuntimeExecutionTarget['runtimeConfig'],
): RuntimeDependencyScope {
    return {
        performerIds: unique(performerIds),
        actIds: unique(actIds),
        draftIds: draftIdsFromRuntimeRefs(runtimeConfig.talRef, runtimeConfig.danceRefs),
    }
}

function buildTargetScope(options: RuntimeExecutionTarget): RuntimeDependencyScope {
    return createRuntimeDependencyScope(
        [options.performerId],
        [options.actId],
        options.runtimeConfig,
    )
}

function buildRunningSessionScope(state: StudioState, sessionId: string): RuntimeDependencyScope | null {
    const chatKey = state.sessionToChatKey?.[sessionId]
    if (!chatKey) {
        return null
    }

    const target = describeChatTarget(chatKey)
    if (target.kind === 'assistant') {
        return null
    }

    if (target.kind === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.performerId) || null
        return createRuntimeDependencyScope(
            [target.performerId],
            [],
            performer
                ? resolvePerformerRuntimeConfig(performer)
                : { talRef: null, danceRefs: [] },
        )
    }

    const act = state.acts.find((entry) => entry.id === target.actId)
    const performer = resolveBindingPerformer(state, act?.participants?.[target.participantKey])
    return createRuntimeDependencyScope(
        [performer?.id],
        [target.actId],
        performer
            ? resolvePerformerRuntimeConfig(performer)
            : { talRef: null, danceRefs: [] },
    )
}

function scopesOverlap(left: RuntimeDependencyScope, right: RuntimeDependencyScope) {
    return left.performerIds.some((id) => right.performerIds.includes(id))
        || left.actIds.some((id) => right.actIds.includes(id))
        || left.draftIds.some((id) => right.draftIds.includes(id))
}

export function isStudioSessionRunning(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses'>,
    sessionId: string,
) {
    const statusType = state.seStatuses?.[sessionId]?.type
    if (statusType === 'busy' || statusType === 'retry') {
        return true
    }
    if (statusType === 'idle' || statusType === 'error') {
        return false
    }
    return !!state.sessionLoading?.[sessionId]
}

export function collectRunningStudioSessionIds(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses'>,
) {
    const sessionIds = new Set<string>([
        ...Object.keys(state.sessionLoading || {}),
        ...Object.keys(state.seStatuses || {}),
    ])

    return Array.from(sessionIds).filter((sessionId) => isStudioSessionRunning(state, sessionId))
}

export function hasRunningStudioSessions(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses'>,
) {
    return collectRunningStudioSessionIds(state).length > 0
}

export function hasConflictingRunningStudioSessions(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses' | 'sessionToChatKey' | 'performers' | 'acts'>,
    target: RuntimeExecutionTarget,
) {
    const targetScope = buildTargetScope(target)
    return collectRunningStudioSessionIds(state).some((sessionId) => {
        const runningScope = buildRunningSessionScope({
            sessionLoading: state.sessionLoading,
            seStatuses: state.seStatuses,
            sessionToChatKey: state.sessionToChatKey || {},
            performers: state.performers || [],
            acts: state.acts || [],
        } as StudioState, sessionId)
        return !!runningScope && scopesOverlap(runningScope, targetScope)
    })
}
