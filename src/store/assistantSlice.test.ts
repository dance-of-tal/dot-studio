import { describe, expect, it } from 'vitest'
import type { StudioState } from './types'
import { createAssistantSlice } from './assistantSlice'

function createBaseState(): StudioState {
    return {
        workspaceDirty: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
    } as unknown as StudioState
}

function createHarness(base: StudioState = createBaseState()) {
    let state = base
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state
    const slice = createAssistantSlice(set, get, {} as never)
    state = { ...slice, ...state } as StudioState
    return {
        get: () => state,
    }
}

describe('assistantSlice', () => {
    it('marks the workspace dirty when the assistant model changes', () => {
        const harness = createHarness()

        harness.get().setAssistantModel({ provider: 'openai', modelId: 'gpt-5.4' })

        expect(harness.get().assistantModel).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(harness.get().workspaceDirty).toBe(true)
    })

    it('does not dirty the workspace when the assistant model is unchanged', () => {
        const harness = createHarness({
            ...createBaseState(),
            workspaceDirty: false,
            assistantModel: { provider: 'openai', modelId: 'gpt-5.4' },
        } as StudioState)

        harness.get().setAssistantModel({ provider: 'openai', modelId: 'gpt-5.4' })

        expect(harness.get().workspaceDirty).toBe(false)
    })
})
