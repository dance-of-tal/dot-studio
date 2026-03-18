/**
 * wake-cascade.ts — Wake-up orchestration
 *
 * Connects: event-router → wake-prompt-builder → session-queue → session injection
 * PRD §15: After a tool call produces an event, this module:
 * 1. Routes the event to matching performers
 * 2. Builds wake-up prompts for each target
 * 3. Queues or immediately injects the prompt via OpenCode session.promptAsync
 */

import type { MailboxEvent, ActDefinition } from '../../../shared/act-types.js'
import { routeEvent, type WakeUpTarget } from './event-router.js'
import { buildWakePrompt, markMessagesDelivered } from './wake-prompt-builder.js'
import { SessionQueue } from './session-queue.js'
import type { Mailbox } from './mailbox.js'
import type { ThreadManager } from './thread-manager.js'

// Module-level session queue (one per thread)
const sessionQueues: Map<string, SessionQueue> = new Map()

function getSessionQueue(threadId: string): SessionQueue {
    if (!sessionQueues.has(threadId)) {
        sessionQueues.set(threadId, new SessionQueue())
    }
    return sessionQueues.get(threadId)!
}

export interface WakeCascadeResult {
    targets: WakeUpTarget[]
    queued: string[]    // performer keys that were queued
    injected: string[]  // performer keys that were immediately injected
    errors: string[]    // any error messages
}

/**
 * Process an event through the routing and wake-up cascade.
 * Called after tool call routes (send-message, post-to-board, etc.)
 */
export async function processWakeCascade(
    event: MailboxEvent,
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
): Promise<WakeCascadeResult> {
    const result: WakeCascadeResult = {
        targets: [],
        queued: [],
        injected: [],
        errors: [],
    }

    // 1. Route event to matching performers
    const recentEvents = await threadManager.getRecentEvents(threadId, 20)
    const targets = routeEvent(event, actDefinition, mailbox, recentEvents)
    result.targets = targets

    if (targets.length === 0) return result

    // 2. Process each wake-up target
    const queue = getSessionQueue(threadId)

    for (const target of targets) {
        const performerKey = target.performerKey

        // Check if performer is already executing (Same Performer Policy)
        if (queue.isRunning(performerKey)) {
            queue.enqueue(performerKey, target)
            result.queued.push(performerKey)
            continue
        }

        // Build wake-up prompt
        const prompt = buildWakePrompt(target, mailbox)

        // Mark messages as delivered
        markMessagesDelivered(mailbox, performerKey)

        // Mark as executing
        queue.markRunning(performerKey)

        // Inject prompt into performer's session
        try {
            const sessionId = threadManager.getPerformerSession(threadId, performerKey)
            if (!sessionId) {
                result.errors.push(`No session found for performer ${performerKey}`)
                queue.markIdle(performerKey)
                continue
            }

            // Use dynamic import to avoid circular dependency
            const { getOpencode } = await import('../../lib/opencode.js')
            const oc = await getOpencode()
            const { getSafeOwnerExecutionDir } = await import('../../lib/safe-mode.js')
            const executionDir = await getSafeOwnerExecutionDir(
                threadManager['_workingDir'],
                'act',
                actDefinition.id,
                'direct',
            )

            await oc.session.promptAsync({
                sessionID: sessionId,
                directory: executionDir,
                parts: [{ type: 'text', text: prompt }],
            })

            result.injected.push(performerKey)

            // After execution, process any queued events
            queue.markIdle(performerKey)
            // Note: queued events are processed on next cascade
        } catch (err: any) {
            result.errors.push(`Wake injection failed for ${performerKey}: ${err.message}`)
            queue.markIdle(performerKey)
        }
    }

    return result
}
