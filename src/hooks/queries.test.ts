import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
            clear: () => undefined,
        },
    })
})

describe('queryKeys.models', () => {
    it('scopes model queries to the current working directory', async () => {
        const { queryKeys } = await import('./queries')
        expect(queryKeys.models('/tmp/worktree')).toEqual(['models', '/tmp/worktree'])
    })
})
