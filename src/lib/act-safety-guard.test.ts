import { describe, expect, it } from 'vitest'
import { SafetyGuard } from '../../server/services/act-runtime/safety-guard.js'
import type { ActThread } from '../types'

describe('SafetyGuard thread timeout', () => {
    it('uses the current user turn as the timeout baseline', () => {
        const guard = new SafetyGuard()
        const thread: ActThread = {
            id: 'thread-1',
            actId: 'act-1',
            mailbox: {
                pendingMessages: [],
                board: {},
                wakeConditions: [],
            },
            participantSessions: {},
            participantStatuses: {},
            createdAt: Date.now() - (3 * 60 * 60 * 1000),
            status: 'active',
        }

        guard.reset(Date.now())
        expect(guard.checkTimeout(thread)).toEqual({ ok: true })
    })

    it('respects an explicit thread timeout from act safety', () => {
        const guard = SafetyGuard.fromActSafety({ threadTimeoutMs: 1_000 })
        const thread: ActThread = {
            id: 'thread-1',
            actId: 'act-1',
            mailbox: {
                pendingMessages: [],
                board: {},
                wakeConditions: [],
            },
            participantSessions: {},
            participantStatuses: {},
            createdAt: Date.now() - 2_000,
            status: 'active',
        }

        guard.reset(Date.now() - 2_000)
        const result = guard.checkTimeout(thread)

        expect(result.ok).toBe(false)
        expect(result.reason).toContain('Thread timeout exceeded')
    })

    it('resets per-turn counters when a new user turn begins', () => {
        const guard = new SafetyGuard({ maxMessagesPerPair: 1 })

        expect(guard.checkPairBudget('CEO', 'Growth')).toEqual({ ok: true })
        expect(guard.checkPairBudget('CEO', 'Growth').ok).toBe(false)

        guard.reset(Date.now())

        expect(guard.checkPairBudget('CEO', 'Growth')).toEqual({ ok: true })
    })
})
