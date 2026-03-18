/**
 * session-queue.ts — Same Performer Policy queue
 *
 * PRD §15.4: If the same performer is already executing, queue new wake-ups.
 * Supports coalescing rules for board key updates and sender messages.
 */

import type { WakeUpTarget } from './event-router.js'

interface QueueEntry {
    target: WakeUpTarget
    enqueuedAt: number
}

export class SessionQueue {
    private queues: Map<string, QueueEntry[]> = new Map()
    private running: Set<string> = new Set()

    /**
     * Mark a performer as currently running.
     */
    markRunning(performerKey: string): void {
        this.running.add(performerKey)
    }

    /**
     * Mark a performer as no longer running. Returns the next queued wake-up if any.
     */
    markIdle(performerKey: string): WakeUpTarget | null {
        this.running.delete(performerKey)
        return this.dequeue(performerKey)
    }

    /**
     * Check if a performer is currently running.
     */
    isRunning(performerKey: string): boolean {
        return this.running.has(performerKey)
    }

    /**
     * Enqueue a wake-up for a performer. Applies coalescing rules.
     */
    enqueue(performerKey: string, wakeUp: WakeUpTarget): void {
        let queue = this.queues.get(performerKey)
        if (!queue) {
            queue = []
            this.queues.set(performerKey, queue)
        }

        // ── Coalescing rules ────────────────────────
        const payload = wakeUp.triggerEvent.payload as Record<string, any>

        // Rule 1: Same board key update → replace (latest-only)
        if (wakeUp.triggerEvent.type === 'board.posted' || wakeUp.triggerEvent.type === 'board.updated') {
            const key = payload.key
            const existingIdx = queue.findIndex((entry) => {
                const ep = entry.target.triggerEvent.payload as Record<string, any>
                return (entry.target.triggerEvent.type === 'board.posted' || entry.target.triggerEvent.type === 'board.updated')
                    && ep.key === key
            })
            if (existingIdx !== -1) {
                queue[existingIdx] = { target: wakeUp, enqueuedAt: Date.now() }
                return
            }
        }

        // Rule 2: Same sender consecutive messages → batch (replace with latest)
        if (wakeUp.triggerEvent.type === 'message.sent') {
            const from = payload.from
            const tag = payload.tag
            const existingIdx = queue.findIndex((entry) => {
                const ep = entry.target.triggerEvent.payload as Record<string, any>
                return entry.target.triggerEvent.type === 'message.sent'
                    && ep.from === from
                    && ep.tag === tag  // Different tags are not merged
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
     * Dequeue the next wake-up for a performer.
     */
    dequeue(performerKey: string): WakeUpTarget | null {
        const queue = this.queues.get(performerKey)
        if (!queue || queue.length === 0) return null

        const entry = queue.shift()!
        if (queue.length === 0) {
            this.queues.delete(performerKey)
        }
        return entry.target
    }

    /**
     * Get the queue depth for a performer.
     */
    getQueueDepth(performerKey: string): number {
        return this.queues.get(performerKey)?.length ?? 0
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
