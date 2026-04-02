import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createSessionSlice } from './session-entity-store'
import { createFreshSessionBinding } from './session-commands'
import { describeChatTarget } from '../../../shared/chat-targets'

const { createSessionMock } = vi.hoisted(() => ({
    createSessionMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            createSession: createSessionMock,
        },
    },
}))

function createSessionState(overrides: Partial<StudioState> = {}) {
    let state = {} as StudioState

    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const update = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...update } as StudioState
    }

    const slice = createSessionSlice(
        set as never,
        (() => state) as never,
        {} as never,
    )

    state = {
        ...slice,
        actThreads: {},
        ...overrides,
    } as StudioState

    return {
        get: () => state,
        set,
    }
}

describe('session commands', () => {
    beforeEach(() => {
        createSessionMock.mockReset()
    })

    it('creates a fresh backend session even when the chat key is already bound', async () => {
        createSessionMock.mockResolvedValue({
            sessionId: 'session-new',
            title: 'Performer 1',
        })

        const store = createSessionState({
            chatKeyToSession: { 'performer-1': 'session-old' },
            sessionToChatKey: { 'session-old': 'performer-1' },
        })

        const sessionId = await createFreshSessionBinding(
            store.set,
            store.get,
            describeChatTarget('performer-1'),
            { title: 'Performer 1' },
        )

        const state = store.get()
        expect(sessionId).toBe('session-new')
        expect(createSessionMock).toHaveBeenCalledOnce()
        expect(state.chatKeyToSession['performer-1']).toBe('session-new')
        expect(state.sessionToChatKey['session-old']).toBeUndefined()
        expect(state.sessionToChatKey['session-new']).toBe('performer-1')
        expect(state.seEntities['session-new']).toMatchObject({
            id: 'session-new',
            title: 'Performer 1',
        })
    })
})
