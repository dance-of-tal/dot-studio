import { describe, expect, it } from 'vitest'
import {
    getProviderAuthSuccessAction,
    isBuiltinOpenCodeProvider,
    mergeProviders,
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

describe('mergeProviders', () => {
    it('marks a provider connected when provider connections say connected', () => {
        const merged = mergeProviders([
            {
                id: 'openai',
                name: 'OpenAI',
                source: 'builtin',
                env: [],
                connected: false,
                modelCount: 10,
                defaultModel: 'gpt-5',
            },
        ], {
            openai: [
                { type: 'oauth', label: 'Browser OAuth' },
            ],
        }, {
            openai: { connected: true, authType: 'oauth' },
        })

        expect(merged).toHaveLength(1)
        expect(merged[0].connected).toBe(true)
        expect(merged[0].authMethods).toEqual([
            { type: 'oauth', label: 'Browser OAuth' },
        ])
    })

    it('creates a provider card from global auth state even when project providers are unavailable', () => {
        const merged = mergeProviders([], {
            openai: [
                { type: 'oauth', label: 'Browser OAuth' },
            ],
        }, {
            openai: { connected: true, authType: 'oauth' },
        })

        expect(merged).toHaveLength(1)
        expect(merged[0].id).toBe('openai')
        expect(merged[0].connected).toBe(true)
    })
})
