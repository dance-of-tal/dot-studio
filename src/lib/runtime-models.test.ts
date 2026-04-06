import { describe, expect, it } from 'vitest'
import {
    ALL_MODEL_PROVIDER_FILTER,
    buildRuntimeModelProviderGroups,
    buildRuntimeModelProviderTabs,
    matchesModelProviderFilter,
    modelProviderFilterForProvider,
    readProviderIdFromModelFilter,
} from './runtime-models'

const models = [
    { provider: 'openai', providerName: 'OpenAI', id: 'gpt-5.4', name: 'GPT-5.4', connected: true },
    { provider: 'opencode', providerName: 'OpenCode', id: 'gpt-5-nano', name: 'GPT-5 Nano', connected: true },
    { provider: 'anthropic', providerName: 'Anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4', connected: true },
] as const

describe('model provider filters', () => {
    it('builds a namespaced filter key from a provider id', () => {
        expect(modelProviderFilterForProvider('opencode')).toBe('provider:opencode')
    })

    it('reads provider ids back from filter keys', () => {
        expect(readProviderIdFromModelFilter(ALL_MODEL_PROVIDER_FILTER)).toBeNull()
        expect(readProviderIdFromModelFilter('provider:opencode')).toBe('opencode')
    })

    it('matches models against exact provider filters', () => {
        expect(matchesModelProviderFilter(models[1], 'provider:opencode')).toBe(true)
        expect(matchesModelProviderFilter(models[0], 'provider:opencode')).toBe(false)
    })
})

describe('buildRuntimeModelProviderGroups', () => {
    it('keeps OpenCode models grouped under their own provider', () => {
        const groups = buildRuntimeModelProviderGroups(models)

        expect(groups.map((group) => group.providerId)).toEqual(['opencode', 'anthropic', 'openai'])
        expect(groups[0].models.map((model) => model.id)).toEqual(['gpt-5-nano'])
    })
})

describe('buildRuntimeModelProviderTabs', () => {
    it('builds tabs from the actual connected providers', () => {
        expect(buildRuntimeModelProviderTabs(models, { connectedOnly: true })).toEqual([
            { key: 'all', label: 'All' },
            { key: 'provider:opencode', label: 'OpenCode' },
            { key: 'provider:anthropic', label: 'Anthropic' },
            { key: 'provider:openai', label: 'OpenAI' },
        ])
    })
})
