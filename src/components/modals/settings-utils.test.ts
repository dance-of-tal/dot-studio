import { describe, expect, it } from 'vitest'
import {
    areVisibleProviderPromptsComplete,
    buildApiKeyProviderAuth,
    buildProviderAuthOptions,
    buildProviderCards,
    buildVisibleProviderPromptInputs,
    createPromptValueDraft,
    getProviderAuthSuccessAction,
    getConnectedProviderCards,
    getPopularProviderCards,
    getVisibleProviderAuthPrompts,
    shouldShowProviderConnectModal,
} from './settings-utils'
import type { ProviderCard } from './settings-utils'

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

describe('provider auth prompts', () => {
    it('seeds select prompts with the first option', () => {
        expect(createPromptValueDraft([
            {
                type: 'select',
                key: 'deploymentType',
                message: 'Deployment type',
                options: [
                    { label: 'Public', value: 'github.com' },
                    { label: 'Enterprise', value: 'enterprise' },
                ],
            },
        ])).toEqual({
            deploymentType: 'github.com',
        })
    })

    it('filters prompts by their visibility rule', () => {
        const prompts = getVisibleProviderAuthPrompts([
            {
                type: 'select',
                key: 'deploymentType',
                message: 'Deployment type',
                options: [
                    { label: 'Public', value: 'github.com' },
                    { label: 'Enterprise', value: 'enterprise' },
                ],
            },
            {
                type: 'text',
                key: 'enterpriseUrl',
                message: 'Enterprise URL',
                when: { key: 'deploymentType', op: 'eq', value: 'enterprise' },
            },
        ], {
            deploymentType: 'github.com',
        })

        expect(prompts.map((prompt) => prompt.key)).toEqual(['deploymentType'])
    })

    it('serializes only visible non-empty prompt inputs', () => {
        expect(buildVisibleProviderPromptInputs([
            {
                type: 'select',
                key: 'deploymentType',
                message: 'Deployment type',
                options: [
                    { label: 'Public', value: 'github.com' },
                    { label: 'Enterprise', value: 'enterprise' },
                ],
            },
            {
                type: 'text',
                key: 'enterpriseUrl',
                message: 'Enterprise URL',
                when: { key: 'deploymentType', op: 'eq', value: 'enterprise' },
            },
        ], {
            deploymentType: 'github.com',
            enterpriseUrl: ' https://ghe.example.com ',
        })).toEqual({
            deploymentType: 'github.com',
        })
    })

    it('treats hidden prompts as optional for completion', () => {
        expect(areVisibleProviderPromptsComplete([
            {
                type: 'select',
                key: 'deploymentType',
                message: 'Deployment type',
                options: [
                    { label: 'Public', value: 'github.com' },
                    { label: 'Enterprise', value: 'enterprise' },
                ],
            },
            {
                type: 'text',
                key: 'enterpriseUrl',
                message: 'Enterprise URL',
                when: { key: 'deploymentType', op: 'eq', value: 'enterprise' },
            },
        ], {
            deploymentType: 'github.com',
            enterpriseUrl: '',
        })).toBe(true)
    })

    it('builds API auth metadata from visible prompts', () => {
        expect(buildApiKeyProviderAuth(' secret-key ', [
            {
                type: 'select',
                key: 'gateway',
                message: 'Gateway',
                options: [
                    { label: 'Public', value: 'public' },
                ],
            },
            {
                type: 'text',
                key: 'accountId',
                message: 'Account ID',
            },
        ], {
            gateway: 'public',
            accountId: ' acct_123 ',
        })).toEqual({
            type: 'api',
            key: 'secret-key',
            metadata: {
                gateway: 'public',
                accountId: 'acct_123',
            },
        })
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

describe('buildProviderAuthOptions', () => {
    it('keeps OpenCode auth methods first-class and ordered api then oauth', () => {
        const provider: ProviderCard = {
            id: 'cloudflare',
            name: 'Cloudflare',
            source: 'builtin',
            env: ['CLOUDFLARE_API_TOKEN'],
            connected: false,
            modelCount: 2,
            defaultModel: null,
            hasPaidModels: true,
            authMethods: [
                { type: 'oauth', label: 'Browser OAuth' },
                { type: 'api', label: 'API Token' },
            ],
        }

        expect(buildProviderAuthOptions(provider)).toEqual([
            { method: { type: 'api', label: 'API Token' }, methodIndex: 1, source: 'provider' },
            { method: { type: 'oauth', label: 'Browser OAuth' }, methodIndex: 0, source: 'provider' },
        ])
    })

    it('adds one compatibility API method for env-backed providers with no advertised api auth method', () => {
        const provider: ProviderCard = {
            id: 'openai',
            name: 'OpenAI',
            source: 'builtin',
            env: ['OPENAI_API_KEY'],
            connected: false,
            modelCount: 10,
            defaultModel: 'gpt-5',
            hasPaidModels: true,
            authMethods: [{ type: 'oauth', label: 'Browser OAuth' }],
        }

        expect(buildProviderAuthOptions(provider)).toEqual([
            { method: { type: 'api', label: 'API Key' }, methodIndex: -1, source: 'compat' },
            { method: { type: 'oauth', label: 'Browser OAuth' }, methodIndex: 0, source: 'provider' },
        ])
    })
})

describe('shouldShowProviderConnectModal', () => {
    it('opens for a popular provider that is connected but still has auth options', () => {
        const provider: ProviderCard = {
            id: 'opencode',
            name: 'OpenCode Zen',
            source: 'builtin',
            env: ['OPENCODE_API_KEY'],
            connected: true,
            modelCount: 5,
            defaultModel: 'zen-free',
            hasPaidModels: false,
            authMethods: [],
        }

        expect(shouldShowProviderConnectModal(provider, undefined, null)).toBe(true)
    })

    it('stays closed when there is no provider and no active flow', () => {
        expect(shouldShowProviderConnectModal(null, undefined, null)).toBe(false)
    })
})
