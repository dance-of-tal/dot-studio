import { describe, expect, it } from 'vitest'
import {
    pickPreferredAssistantModel,
    toAssistantAvailableModels,
} from './assistant-models'

describe('assistant-models', () => {
    it('sorts connected assistant models toward stronger tool-capable defaults', () => {
        const models = toAssistantAvailableModels([
            {
                provider: 'opencode',
                providerName: 'OpenCode Zen',
                id: 'gpt-5-nano',
                name: 'GPT-5 Nano',
                connected: true,
                toolCall: true,
                context: 0,
                output: 0,
                reasoning: false,
                attachment: false,
                temperature: false,
                modalities: { input: ['text'], output: ['text'] },
                variants: [],
            },
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5.4-mini',
                name: 'GPT-5.4 mini',
                connected: true,
                toolCall: true,
                context: 0,
                output: 0,
                reasoning: false,
                attachment: false,
                temperature: false,
                modalities: { input: ['text'], output: ['text'] },
                variants: [],
            },
            {
                provider: 'opencode',
                providerName: 'OpenCode Zen',
                id: 'big-pickle',
                name: 'Big Pickle',
                connected: true,
                toolCall: true,
                context: 0,
                output: 0,
                reasoning: false,
                attachment: false,
                temperature: false,
                modalities: { input: ['text'], output: ['text'] },
                variants: [],
            },
            {
                provider: 'anthropic',
                providerName: 'Anthropic',
                id: 'claude-sonnet-4',
                name: 'Claude Sonnet 4',
                connected: true,
                toolCall: false,
                context: 0,
                output: 0,
                reasoning: false,
                attachment: false,
                temperature: false,
                modalities: { input: ['text'], output: ['text'] },
                variants: [],
            },
        ])

        expect(models.map((model) => model.modelId)).toEqual([
            'gpt-5.4-mini',
            'gpt-5-nano',
            'big-pickle',
        ])
        expect(pickPreferredAssistantModel(models)).toMatchObject({
            provider: 'openai',
            modelId: 'gpt-5.4-mini',
        })
    })
})
