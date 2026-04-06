import { describe, expect, it } from 'vitest'
import {
    buildProviderCards,
    getProviderAuthSuccessAction,
    getConnectedProviderCards,
    getPopularProviderCards,
} from './settings-utils'

describe('provider card grouping', () => {
    it('hides free-only opencode from the connected section', () => {
        expect(getConnectedProviderCards([
            {
                id: 'opencode',
                name: 'OpenCode Zen',
                source: 'custom',
                env: ['OPENCODE_API_KEY'],
                connected: true,
                modelCount: 5,
                defaultModel: 'big-pickle',
                hasPaidModels: false,
                authMethods: [],
            },
        ])).toEqual([])
    })

    it('keeps free-only opencode in the popular section', () => {
        expect(getPopularProviderCards([
            {
                id: 'opencode',
                name: 'OpenCode Zen',
                source: 'custom',
                env: ['OPENCODE_API_KEY'],
                connected: true,
                modelCount: 5,
                defaultModel: 'big-pickle',
                hasPaidModels: false,
                authMethods: [],
            },
        ]).map((provider) => provider.id)).toEqual(['opencode'])
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

describe('buildProviderCards', () => {
    it('attaches auth methods to providers returned by opencode', () => {
        const merged = buildProviderCards([
            {
                id: 'openai',
                name: 'OpenAI',
                source: 'builtin',
                env: [],
                connected: true,
                modelCount: 10,
                defaultModel: 'gpt-5',
                hasPaidModels: true,
            },
        ], {
            openai: [
                { type: 'oauth', label: 'Browser OAuth' },
            ],
        })

        expect(merged).toHaveLength(1)
        expect(merged[0].connected).toBe(true)
        expect(merged[0].authMethods).toEqual([
            { type: 'oauth', label: 'Browser OAuth' },
        ])
    })

    it('keeps popular providers visible even when they are disconnected', () => {
        const merged = buildProviderCards([
            {
                id: 'openai',
                name: 'OpenAI',
                source: 'builtin',
                env: [],
                connected: false,
                modelCount: 10,
                defaultModel: 'gpt-5',
                hasPaidModels: true,
            },
        ], {})

        expect(merged).toHaveLength(1)
        expect(merged[0].id).toBe('openai')
        expect(merged[0].connected).toBe(false)
    })

    it('does not fabricate provider cards that are missing from provider.list', () => {
        const merged = buildProviderCards([], {
            openai: [{ type: 'oauth', label: 'Browser OAuth' }],
        })

        expect(merged).toEqual([])
    })
})
