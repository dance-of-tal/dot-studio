/**
 * session-queue.ts — Same Participant Policy queue
 *
 * PRD §15.4: If the same participant is already executing, queue new wake-ups.
 * Supports coalescing rules for board key updates and sender messages.
 */

import type { WakeUpTarget } from './event-router.js'

interface QueueEntry {
    target: WakeUpTarget
    enqueuedAt: number
}

function payloadString(payload: Record<string, unknown>, key: string) {
    const value = payload[key]
    return typeof value === 'string' ? value : undefined
}

export class SessionQueue {
    private queues: Map<string, QueueEntry[]> = new Map()
    private running: Set<string> = new Set()

    /**
     * Mark a participant as currently running.
     */
    markRunning(participantKey: string): void {
        this.running.add(participantKey)
    }

    /**
     * Mark a participant as no longer running. Returns the next queued wake-up if any.
     */
    markIdle(participantKey: string): WakeUpTarget | null {
        this.running.delete(participantKey)
        return this.dequeue(participantKey)
    }

    /**
     * Check if a participant is currently running.
     */
    isRunning(participantKey: string): boolean {
        return this.running.has(participantKey)
    }

    /**
     * Enqueue a wake-up for a participant. Applies coalescing rules.
     */
    enqueue(participantKey: string, wakeUp: WakeUpTarget): void {
        let queue = this.queues.get(participantKey)
        if (!queue) {
            queue = []
            this.queues.set(participantKey, queue)
        }

        // ── Coalescing rules ────────────────────────
        const payload = wakeUp.triggerEvent.payload

        // Rule 1: Same board key update → replace (latest-only)
        if (wakeUp.triggerEvent.type === 'board.posted' || wakeUp.triggerEvent.type === 'board.updated') {
            const key = payloadString(payload, 'key')
            const existingIdx = queue.findIndex((entry) => {
                const ep = entry.target.triggerEvent.payload
                return (entry.target.triggerEvent.type === 'board.posted' || entry.target.triggerEvent.type === 'board.updated')
                    && payloadString(ep, 'key') === key
            })
            if (existingIdx !== -1) {
                queue[existingIdx] = { target: wakeUp, enqueuedAt: Date.now() }
                return
            }
        }

        // Rule 2: Same sender consecutive messages → batch (replace with latest)
        if (wakeUp.triggerEvent.type === 'message.sent') {
            const from = payloadString(payload, 'from')
            const tag = payloadString(payload, 'tag')
            const existingIdx = queue.findIndex((entry) => {
                const ep = entry.target.triggerEvent.payload
                return entry.target.triggerEvent.type === 'message.sent'
                    && payloadString(ep, 'from') === from
                    && payloadString(ep, 'tag') === tag  // Different tags are not merged
            })
            if (existingIdx !== -1) {
                queue[existingIdx] = { target: wakeUp, enqueuedAt: Date.now() }
                return
            }
        }

        // No coalescing — just append
        queue.push({ target: wakeUp, enqueuedAt: Date.now() })
    }

    /**
     * Dequeue the next wake-up for a participant.
     */
    dequeue(participantKey: string): WakeUpTarget | null {
        const queue = this.queues.get(participantKey)
        if (!queue || queue.length === 0) return null

        const entry = queue.shift()!
        if (queue.length === 0) {
            this.queues.delete(participantKey)
        }
        return entry.target
    }

    /**
     * Get the queue depth for a participant.
     */
    getQueueDepth(participantKey: string): number {
        return this.queues.get(participantKey)?.length ?? 0
    }

    /**
     * Check if any queues have pending items.
     */
    hasAnyPending(): boolean {
        for (const queue of this.queues.values()) {
            if (queue.length > 0) return true
        }
        return false
    }

    /**
     * Clear all queues and running state.
     */
    clear(): void {
        this.queues.clear()
        this.running.clear()
    }
}
