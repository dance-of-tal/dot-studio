import { describe, expect, it } from 'vitest'
import { shouldLogRequest } from './server-logger.js'

describe('shouldLogRequest', () => {
    it('skips healthy fast requests on quiet health endpoints', () => {
        expect(shouldLogRequest('/health', 200, 20)).toBe(false)
        expect(shouldLogRequest('/api/health', 204, 50)).toBe(false)
    })

    it('logs warnings for client errors and slow requests', () => {
        expect(shouldLogRequest('/api/chat', 404, 15)).toBe(true)
        expect(shouldLogRequest('/api/chat', 200, 1200)).toBe(true)
    })

    it('always logs server errors, including on health endpoints', () => {
        expect(shouldLogRequest('/health', 500, 10)).toBe(true)
    })
})
