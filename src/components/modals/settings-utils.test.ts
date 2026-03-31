import { describe, expect, it } from 'vitest'
import {
    getProviderAuthSuccessAction,
    isBuiltinOpenCodeProvider,
    shouldDisplayConnectedProvider,
} from './settings-utils'

describe('isBuiltinOpenCodeProvider', () => {
    it('treats builtin opencode as hidden from connected providers', () => {
        expect(isBuiltinOpenCodeProvider({ id: 'opencode', source: 'builtin' })).toBe(true)
    })

    it('keeps custom opencode providers visible', () => {
        expect(isBuiltinOpenCodeProvider({ id: 'opencode', source: 'custom' })).toBe(false)
    })
})

describe('shouldDisplayConnectedProvider', () => {
    it('shows connected custom opencode providers', () => {
        expect(shouldDisplayConnectedProvider({
            id: 'opencode',
            source: 'custom',
            connected: true,
        })).toBe(true)
    })

    it('hides disconnected providers', () => {
        expect(shouldDisplayConnectedProvider({
            id: 'openai',
            source: 'builtin',
            connected: false,
        })).toBe(false)
    })
})

describe('getProviderAuthSuccessAction', () => {
    it('closes the modal when no performer is selected', () => {
        expect(getProviderAuthSuccessAction(null)).toBe('close-modal')
    })

    it('opens the model picker when a performer is selected', () => {
        expect(getProviderAuthSuccessAction({ id: 'p1', name: 'Lead' })).toBe('pick-model')
    })
})
