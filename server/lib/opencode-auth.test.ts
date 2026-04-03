import { describe, expect, it } from 'vitest'
import { buildStoredProviderConnections } from './opencode-auth.js'

describe('buildStoredProviderConnections', () => {
    it('marks every stored auth entry as connected', () => {
        expect(buildStoredProviderConnections({
            openai: 'oauth',
            anthropic: 'api',
        })).toEqual({
            openai: {
                connected: true,
                authType: 'oauth',
            },
            anthropic: {
                connected: true,
                authType: 'api',
            },
        })
    })
})
