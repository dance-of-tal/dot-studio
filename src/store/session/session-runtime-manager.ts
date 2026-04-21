import { isSessionParkedByWaitUntil } from './session-activity'
import { createSessionRuntimeActor, type SessionRuntimeActorRef, type SessionRuntimePatch } from './session-runtime'
import type { StudioState } from '../types'

type SessionRuntimeSet = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type SessionRuntimeGet = () => StudioState

type RuntimeEntry = {
    chatKey: string
    sessionId: string | null
    lastProjectedLoading: boolean
    lastProjectedMutating: boolean
    actor: SessionRuntimeActorRef
    unsubscribe: { unsubscribe(): void }
}

class SessionRuntimeManager {
    private readonly get: SessionRuntimeGet
    private readonly entries = new Map<string, RuntimeEntry>()
    private readonly sessionToChatKey = new Map<string, string>()

    constructor(get: SessionRuntimeGet) {
        this.get = get
    }

    private setLoading(sessionId: string, loading: boolean, current: boolean) {
        if (current === loading) {
            return
        }
        this.get().setSessionLoading(sessionId, loading)
    }

    private setMutating(sessionId: string, pending: boolean, current: boolean) {
        if (current === pending) {
            return
        }
        this.get().setSessionMutationPending(sessionId, pending)
    }

    ensure(chatKey: string, sessionId?: string | null) {
        const existing = this.entries.get(chatKey)
        if (existing) {
            if (sessionId && existing.sessionId !== sessionId) {
                const previousSessionId = existing.sessionId
                existing.sessionId = sessionId
                this.sessionToChatKey.set(sessionId, chatKey)
                this.patch({ chatKey, patch: { sessionId } })
                if (previousSessionId && previousSessionId !== sessionId) {
                    this.setLoading(previousSessionId, false, existing.lastProjectedLoading)
                    this.setMutating(previousSessionId, false, existing.lastProjectedMutating)
                    existing.lastProjectedLoading = false
                    existing.lastProjectedMutating = false
                    this.sessionToChatKey.delete(previousSessionId)
                }
            }
            return existing.actor
        }

        const actor = createSessionRuntimeActor(chatKey, sessionId)
        const entry: RuntimeEntry = {
            chatKey,
            sessionId: sessionId || null,
            lastProjectedLoading: false,
            lastProjectedMutating: false,
            actor,
            unsubscribe: actor.subscribe((snapshot) => {
                const nextSnapshot = snapshot.context
                const nextSessionId = nextSnapshot.sessionId || entry.sessionId
                const previousSessionId = entry.sessionId
                entry.sessionId = nextSessionId || null
                if (previousSessionId && previousSessionId !== nextSessionId) {
                    this.setLoading(previousSessionId, false, entry.lastProjectedLoading)
                    this.setMutating(previousSessionId, false, entry.lastProjectedMutating)
                    entry.lastProjectedLoading = false
                    entry.lastProjectedMutating = false
                    this.sessionToChatKey.delete(previousSessionId)
                }
                if (!nextSessionId) {
                    return
                }
                this.sessionToChatKey.set(nextSessionId, chatKey)
                const shouldShowLoading = nextSnapshot.phase === 'optimistic' || nextSnapshot.phase === 'syncing'
                const shouldShowMutating = nextSnapshot.phase === 'mutating'
                this.setLoading(nextSessionId, shouldShowLoading, entry.lastProjectedLoading)
                this.setMutating(nextSessionId, shouldShowMutating, entry.lastProjectedMutating)
                entry.lastProjectedLoading = shouldShowLoading
                entry.lastProjectedMutating = shouldShowMutating
            }),
        }
        actor.start()
        this.entries.set(chatKey, entry)
        if (sessionId) {
            this.sessionToChatKey.set(sessionId, chatKey)
        }
        return actor
    }

    patch(input: {
        chatKey?: string | null
        sessionId?: string | null
        patch: SessionRuntimePatch
    }): void {
        const actor = this.resolveActor(input.chatKey || null, input.sessionId || null)
        if (!actor) {
            const derivedChatKey = input.chatKey
                || (input.sessionId ? this.get().sessionToChatKey[input.sessionId] || null : null)
            if (!derivedChatKey) {
                return
            }
            this.ensure(derivedChatKey, input.sessionId)
            this.patch(input)
            return
        }

        actor.send({
            type: 'PATCH',
            patch: input.patch,
        })
    }

    reconcile(chatKey: string, sessionId?: string | null) {
        const actor = this.ensure(chatKey, sessionId)
        const nextSessionId = sessionId || actor.getSnapshot().context.sessionId
        const state = this.get()
        actor.send({
            type: 'PATCH',
            patch: {
                sessionId: nextSessionId || null,
                authoritativeStatus: nextSessionId ? state.seStatuses[nextSessionId] || null : null,
                hasPermission: nextSessionId ? !!state.sePermissions[nextSessionId] : false,
                hasQuestion: nextSessionId ? !!state.seQuestions[nextSessionId] : false,
                parked: nextSessionId ? isSessionParkedByWaitUntil(state.seMessages[nextSessionId] || []) : false,
                errorMessage: nextSessionId && state.seStatuses[nextSessionId]?.type === 'error'
                    ? state.seStatuses[nextSessionId].message || null
                    : null,
            },
        })
    }

    release(input: { chatKey?: string | null; sessionId?: string | null }) {
        const chatKey = input.chatKey
            || (input.sessionId ? this.sessionToChatKey.get(input.sessionId) || null : null)
        if (!chatKey) {
            return
        }
        const entry = this.entries.get(chatKey)
        if (!entry) {
            return
        }
        entry.unsubscribe.unsubscribe()
        entry.actor.stop()
        if (entry.sessionId) {
            this.setLoading(entry.sessionId, false, entry.lastProjectedLoading)
            this.setMutating(entry.sessionId, false, entry.lastProjectedMutating)
            this.sessionToChatKey.delete(entry.sessionId)
        }
        this.entries.delete(chatKey)
    }

    clear() {
        for (const chatKey of Array.from(this.entries.keys())) {
            this.release({ chatKey })
        }
    }

    private resolveActor(chatKey: string | null, sessionId: string | null) {
        if (chatKey && this.entries.has(chatKey)) {
            return this.entries.get(chatKey)?.actor || null
        }
        if (sessionId) {
            const resolvedChatKey = this.sessionToChatKey.get(sessionId)
            if (resolvedChatKey) {
                return this.entries.get(resolvedChatKey)?.actor || null
            }
        }
        return null
    }
}

const managers = new WeakMap<SessionRuntimeGet, SessionRuntimeManager>()

function getManager(set: SessionRuntimeSet, get: SessionRuntimeGet) {
    void set
    const existing = managers.get(get)
    if (existing) {
        return existing
    }
    const manager = new SessionRuntimeManager(get)
    managers.set(get, manager)
    return manager
}

export function ensureSessionRuntimeActor(
    set: SessionRuntimeSet,
    get: SessionRuntimeGet,
    chatKey: string,
    sessionId?: string | null,
) {
    return getManager(set, get).ensure(chatKey, sessionId)
}

export function patchSessionRuntimeActor(
    set: SessionRuntimeSet,
    get: SessionRuntimeGet,
    input: {
        chatKey?: string | null
        sessionId?: string | null
        patch: SessionRuntimePatch
    },
) {
    getManager(set, get).patch(input)
}

export function reconcileSessionRuntimeActor(
    set: SessionRuntimeSet,
    get: SessionRuntimeGet,
    chatKey: string,
    sessionId?: string | null,
) {
    getManager(set, get).reconcile(chatKey, sessionId)
}

export function releaseSessionRuntimeActor(
    set: SessionRuntimeSet,
    get: SessionRuntimeGet,
    input: { chatKey?: string | null; sessionId?: string | null },
) {
    getManager(set, get).release(input)
}

export function clearSessionRuntimeActors(set: SessionRuntimeSet, get: SessionRuntimeGet) {
    getManager(set, get).clear()
}
