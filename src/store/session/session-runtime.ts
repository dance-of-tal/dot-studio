import { createActor, fromTransition, type ActorRefFrom } from 'xstate'
import type { SessionStatus } from './types'

export type SessionRuntimePhase =
    | 'idle'
    | 'optimistic'
    | 'running'
    | 'interactive'
    | 'parked'
    | 'syncing'
    | 'mutating'
    | 'error'

export type SessionRuntimeState = {
    chatKey: string
    sessionId: string | null
    authoritativeStatus: SessionStatus | null
    phase: SessionRuntimePhase
    optimistic: boolean
    syncing: boolean
    mutating: boolean
    supervising: boolean
    hasPermission: boolean
    hasQuestion: boolean
    parked: boolean
    errorMessage: string | null
    lastSyncReason: string | null
}

export type SessionRuntimePatch = Partial<Omit<SessionRuntimeState, 'phase' | 'chatKey'>>

export type SessionRuntimeEvent =
    | {
        type: 'PATCH'
        patch: SessionRuntimePatch
    }

function derivePhase(state: Omit<SessionRuntimeState, 'phase'>): SessionRuntimePhase {
    if (state.mutating) {
        return 'mutating'
    }
    if (state.errorMessage || state.authoritativeStatus?.type === 'error') {
        return 'error'
    }
    if (state.hasPermission || state.hasQuestion) {
        return 'interactive'
    }
    if (state.parked) {
        return 'parked'
    }
    if (state.syncing) {
        return 'syncing'
    }
    if (state.authoritativeStatus?.type === 'busy' || state.authoritativeStatus?.type === 'retry') {
        return 'running'
    }
    if (state.optimistic) {
        return 'optimistic'
    }
    return 'idle'
}

function withDerivedPhase(state: Omit<SessionRuntimeState, 'phase'>): SessionRuntimeState {
    return {
        ...state,
        phase: derivePhase(state),
    }
}

function createSessionRuntimeLogic(initialState: SessionRuntimeState) {
    return fromTransition(
        (state: SessionRuntimeState, event: SessionRuntimeEvent) => {
        const next = {
            ...state,
            ...event.patch,
        }
        return withDerivedPhase(next)
        },
        initialState,
    )
}

export type SessionRuntimeActorRef = ActorRefFrom<ReturnType<typeof createSessionRuntimeLogic>>

export function createSessionRuntimeActor(chatKey: string, sessionId?: string | null) {
    return createActor(createSessionRuntimeLogic(
        withDerivedPhase({
            chatKey,
            sessionId: sessionId || null,
            authoritativeStatus: null,
            optimistic: false,
            syncing: false,
            mutating: false,
            supervising: false,
            hasPermission: false,
            hasQuestion: false,
            parked: false,
            errorMessage: null,
            lastSyncReason: null,
        }),
    ))
}
