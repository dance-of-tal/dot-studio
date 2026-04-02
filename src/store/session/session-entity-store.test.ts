import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import { createSessionSlice } from './session-entity-store'

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
        getState: () => state,
    }
}

describe('session entity store', () => {
    it('drops the stale reverse mapping when a chat key is rebound to a new session', () => {
        const store = createSessionState()

        store.getState().registerBinding('performer-1', 'session-old')
        store.getState().registerBinding('performer-1', 'session-new')

        const state = store.getState()
        expect(state.chatKeyToSession['performer-1']).toBe('session-new')
        expect(state.sessionToChatKey['session-old']).toBeUndefined()
        expect(state.sessionToChatKey['session-new']).toBe('performer-1')
    })

    it('drops the stale forward mapping when a session is rebound to a new chat key', () => {
        const store = createSessionState()

        store.getState().registerBinding('performer-1', 'session-1')
        store.getState().registerBinding('performer-2', 'session-1')

        const state = store.getState()
        expect(state.sessionToChatKey['session-1']).toBe('performer-2')
        expect(state.chatKeyToSession['performer-1']).toBeUndefined()
        expect(state.chatKeyToSession['performer-2']).toBe('session-1')
    })
})
