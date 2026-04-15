import { describe, expect, it } from 'vitest'
import {
    isSessionEffectivelyRunning,
    isSessionEffectivelySettled,
    resolveEffectiveSessionStatus,
} from './chat-session.js'

describe('chat session status helpers', () => {
    it('downgrades stale busy statuses to idle once the latest assistant turn settled', () => {
        expect(resolveEffectiveSessionStatus({
            directStatus: { type: 'busy' },
            messages: [{
                info: {
                    role: 'assistant',
                    time: { completed: 123 },
                },
                parts: [],
            }],
        })).toEqual({ type: 'idle' })
    })

    it('treats wait_until parked sessions as effectively settled', () => {
        const messages = [{
            info: { role: 'assistant' },
            parts: [{
                type: 'tool',
                tool: 'wait_until',
                state: { status: 'completed' },
            }],
        }]

        expect(isSessionEffectivelySettled(messages)).toBe(true)
        expect(isSessionEffectivelyRunning({
            directStatus: { type: 'retry' },
            messages,
        })).toBe(false)
    })

    it('derives implicit idle when OpenCode status is missing but the assistant already completed', () => {
        expect(resolveEffectiveSessionStatus({
            messages: [{
                info: { role: 'assistant' },
                parts: [{
                    type: 'step-finish',
                }],
            }],
        })).toEqual({ type: 'idle' })
    })
})
