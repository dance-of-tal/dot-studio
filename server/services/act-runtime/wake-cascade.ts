/**
 * wake-cascade.ts — Wake-up orchestration
 *
 * Connects: event-router → wake-prompt-builder → session-queue → session injection
 * PRD §15: After a tool call produces an event, this module:
 * 1. Routes the event to matching participants
 * 2. Builds wake-up prompts for each target
 * 3. Queues or immediately injects the prompt via OpenCode session.promptAsync
 */

import type { MailboxEvent, ActDefinition } from '../../../shared/act-types.js'
import { routeEvent, type WakeUpTarget } from './event-router.js'
import { buildWakePrompt, markMessagesDelivered } from './wake-prompt-builder.js'
import { SessionQueue } from './session-queue.js'
import type { Mailbox } from './mailbox.js'
import type { ThreadManager } from './thread-manager.js'
import { ACT_AGENT_POSTURE } from '../../lib/act-session-policy.js'
import { serverDebug } from '../../lib/server-logger.js'

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

// Module-level session queue (one per thread)
const sessionQueues: Map<string, SessionQueue> = new Map()
const participantCircuits = new Map<string, Map<string, { openUntil: number; reason: string }>>()
const blockedWakeRetries = new Map<string, Set<string>>()
const PARTICIPANT_CIRCUIT_BREAK_MS = 5 * 60_000
const BLOCKED_WAKE_RETRY_POLL_MS = 500

function getSessionQueue(threadId: string): SessionQueue {
    if (!sessionQueues.has(threadId)) {
        sessionQueues.set(threadId, new SessionQueue())
    }
    return sessionQueues.get(threadId)!
}

function emptyWakeCascadeResult(): WakeCascadeResult {
    return {
        targets: [],
        queued: [],
        injected: [],
        errors: [],
    }
}

export function markParticipantQueueRunning(threadId: string, participantKey: string): void {
    getSessionQueue(threadId).markRunning(participantKey)
}

export function clearParticipantQueueRunning(threadId: string, participantKey: string): void {
    getSessionQueue(threadId).clearRunning(participantKey)
}

function participantCircuitState(threadId: string, participantKey: string) {
    const byThread = participantCircuits.get(threadId)
    const state = byThread?.get(participantKey)
    if (!state) {
        return null
    }
    if (state.openUntil <= Date.now()) {
        byThread?.delete(participantKey)
        if (byThread && byThread.size === 0) {
            participantCircuits.delete(threadId)
        }
        return null
    }
    return state
}

export function tripParticipantCircuit(threadId: string, participantKey: string, reason: string) {
    const byThread = participantCircuits.get(threadId) || new Map<string, { openUntil: number; reason: string }>()
    byThread.set(participantKey, {
        openUntil: Date.now() + PARTICIPANT_CIRCUIT_BREAK_MS,
        reason,
    })
    participantCircuits.set(threadId, byThread)
}

export function clearParticipantCircuit(threadId: string, participantKey: string) {
    const byThread = participantCircuits.get(threadId)
    if (!byThread) {
        return
    }
    byThread.delete(participantKey)
    if (byThread.size === 0) {
        participantCircuits.delete(threadId)
    }
}

function markBlockedWakeRetryActive(threadId: string, participantKey: string): boolean {
    const byThread = blockedWakeRetries.get(threadId) || new Set<string>()
    if (byThread.has(participantKey)) {
        blockedWakeRetries.set(threadId, byThread)
        return false
    }
    byThread.add(participantKey)
    blockedWakeRetries.set(threadId, byThread)
    return true
}

function clearBlockedWakeRetryActive(threadId: string, participantKey: string) {
    const byThread = blockedWakeRetries.get(threadId)
    if (!byThread) {
        return
    }
    byThread.delete(participantKey)
    if (byThread.size === 0) {
        blockedWakeRetries.delete(threadId)
    }
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

function scheduleBlockedWakeRetry(
    participantKey: string,
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
) {
    if (!markBlockedWakeRetryActive(threadId, participantKey)) {
        return
    }

    void (async () => {
        try {
            const { countRunningSessions } = await import('../runtime-reload-service.js')

            while (getSessionQueue(threadId).getQueueDepth(participantKey) > 0) {
                if (getSessionQueue(threadId).isRunning(participantKey)) {
                    return
                }

                try {
                    const { runningSessions } = await countRunningSessions(workingDir)
                    if (runningSessions === 0) {
                        await drainParticipantQueueAfterSettlement(
                            participantKey,
                            actDefinition,
                            mailbox,
                            threadManager,
                            threadId,
                            workingDir,
                        )
                        return
                    }
                } catch (error) {
                    console.warn(
                        `[wake-cascade] Failed checking running sessions for deferred wake "${participantKey}":`,
                        error,
                    )
                }

                await sleep(BLOCKED_WAKE_RETRY_POLL_MS)
            }
        } finally {
            clearBlockedWakeRetryActive(threadId, participantKey)
        }
    })()
}

export async function drainParticipantQueueAfterSettlement(
    participantKey: string,
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
): Promise<WakeCascadeResult> {
    getSessionQueue(threadId).clearRunning(participantKey)
    return drainNextQueuedWake(actDefinition, mailbox, threadManager, threadId, workingDir, participantKey)
}

export interface WakeCascadeResult {
    targets: WakeUpTarget[]
    queued: string[]    // participant keys that were queued
    injected: string[]  // participant keys that were immediately injected
    errors: string[]    // any error messages
}

/**
 * Fallback: write generic Act tools to execution dir when performer projection
 * is unavailable (no model config or projection failure).
 */
async function writeGenericActTools(
    executionDir: string,
    workingDir: string,
): Promise<void> {
    const { getStaticActTools, COLLABORATION_TOOL_NAMES, LEGACY_COLLABORATION_TOOL_NAMES } = await import('./act-tools.js')
    const actTools = getStaticActTools(workingDir)
    const { promises: fsPromises } = await import('node:fs')
    const { join } = await import('node:path')
    const toolsDir = join(executionDir, '.opencode', 'tools')
    await fsPromises.mkdir(toolsDir, { recursive: true })

    // Clean stale suffixed act tools
    const genericToolNames = new Set<string>(actTools.map(t => t.name))
    const collaborationToolNames = new Set<string>([
        ...COLLABORATION_TOOL_NAMES,
        ...LEGACY_COLLABORATION_TOOL_NAMES,
    ])
    try {
        const existing = await fsPromises.readdir(toolsDir)
        for (const file of existing) {
            if (file.endsWith('.ts')) {
                const toolName = file.replace(/\.ts$/, '')
                if (collaborationToolNames.has(toolName) && !genericToolNames.has(toolName)) {
                    await fsPromises.rm(join(toolsDir, file), { force: true }).catch(() => {})
                }
            }
        }
    } catch {
        // tools dir may not exist yet
    }

    for (const tool of actTools) {
        const toolPath = join(toolsDir, `${tool.name}.ts`)
        await fsPromises.writeFile(toolPath, tool.content, 'utf-8')
    }
}

async function drainNextQueuedWake(
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
    settledParticipantKey?: string,
): Promise<WakeCascadeResult> {
    const queue = getSessionQueue(threadId)

    while (true) {
        const next = queue.dequeueNextRunnable()
        if (!next) {
            return emptyWakeCascadeResult()
        }

        const circuit = participantCircuitState(threadId, next.participantKey)
        if (circuit) {
            console.warn(
                `[wake-cascade] Skipping queued wake for "${next.participantKey}" while circuit is open: ${circuit.reason}`,
            )
            continue
        }

        serverDebug(
            'wake-cascade',
            `Draining queued wake-up for "${next.participantKey}"${settledParticipantKey ? ` after "${settledParticipantKey}" settled` : ''}`,
        )
        return injectWakeTarget(
            next.target,
            actDefinition,
            mailbox,
            threadManager,
            threadId,
            workingDir,
        )
    }
}

async function injectWakeTarget(
    target: WakeUpTarget,
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
): Promise<WakeCascadeResult> {
    const result = emptyWakeCascadeResult()
    result.targets = [target]

    const participantKey = target.participantKey
    const circuit = participantCircuitState(threadId, participantKey)
    if (circuit) {
        console.warn(
            `[wake-cascade] Skipping wake for "${participantKey}" while circuit is open: ${circuit.reason}`,
        )
        return result
    }

    // Build wake-up prompt
    const prompt = buildWakePrompt(target, mailbox, actDefinition)

    // Mark as executing
    markParticipantQueueRunning(threadId, participantKey)

    try {
        // Use dynamic imports to avoid circular dependencies
        const { getOpencode } = await import('../../lib/opencode.js')
        const oc = await getOpencode()
        const { resolveSessionOwnership } = await import('../session-ownership-service.js')

        // Resolve performer config from workspace (model, TAL, Dance, MCP)
        const { resolvePerformerForWake } = await import('./wake-performer-resolver.js')
        const performerConfig = await resolvePerformerForWake(
            threadManager.workingDir,
            actDefinition,
            participantKey,
        )

        const chatKey = `act:${actDefinition.id}:thread:${threadId}:participant:${participantKey}`

        // Auto-create session if participant doesn't have one yet
        let sessionId = threadManager.getPerformerSession(threadId, participantKey)
        if (!sessionId) {
            try {
                const { createStudioChatSession } = await import('../chat-service.js')
                const created = await createStudioChatSession(threadManager.workingDir, {
                    performerId: chatKey,
                    performerName: performerConfig?.performerName || participantKey,
                    configHash: '',
                    actId: actDefinition.id,
                })
                sessionId = created.sessionId
                // Persist the session mapping in the thread
                await threadManager.getOrCreateSession(threadId, participantKey, () => sessionId!)
                serverDebug('wake-cascade', `Auto-created session ${sessionId} for participant "${participantKey}"`)
            } catch (createErr) {
                result.errors.push(`Failed to auto-create session for ${participantKey}: ${errorMessage(createErr)}`)
                const drainResult = await drainParticipantQueueAfterSettlement(
                    participantKey,
                    actDefinition,
                    mailbox,
                    threadManager,
                    threadId,
                    workingDir,
                )
                result.injected.push(...drainResult.injected)
                result.queued.push(...drainResult.queued)
                result.errors.push(...drainResult.errors)
                return result
            }
        }

        const sessionContext = sessionId
            ? await resolveSessionOwnership(sessionId)
            : null
        const executionDir = sessionContext?.workingDir || threadManager.workingDir

        // ── Performer projection (TAL, Dance, MCP, model) ──────────
        // Project Act tools for this participant
        const { projectActTools } = await import('./act-tool-projection.js')
        const actProjection = projectActTools(
            participantKey,
            actDefinition,
            threadId,
            threadManager.workingDir,
        )
        const actExtraTools = actProjection.tools
        const collaborationPromptSection = actProjection.contextPrompt
        let promptText = prompt

        let agentName: string | undefined
        let modelOverride: { providerID: string; modelID: string } | undefined
        let projectedTools: Record<string, boolean> | undefined

        if (performerConfig?.model) {
            // Full performer projection — same as sendStudioChatMessage path
            try {
                const { ensurePerformerProjection } = await import(
                    '../opencode-projection/stage-projection-service.js'
                )
                const { prepareRuntimeForExecution } = await import('../runtime-preparation-service.js')
                const prepared = await prepareRuntimeForExecution(threadManager.workingDir, () => ensurePerformerProjection({
                    performerId: participantKey,
                    performerName: performerConfig.performerName,
                    talRef: performerConfig.talRef,
                    danceRefs: performerConfig.danceRefs,
                    model: performerConfig.model,
                    modelVariant: performerConfig.modelVariant,
                    mcpServerNames: performerConfig.mcpServerNames,
                    workingDir: threadManager.workingDir,
                    scope: 'act',
                    actId: actDefinition.id,
                    collaborationPromptSection,
                    extraTools: actExtraTools,
                }))
                if (prepared.blocked) {
                    console.warn(`[wake-cascade] Projection update blocked for "${participantKey}" while another working-dir session is running`)
                    clearParticipantQueueRunning(threadId, participantKey)
                    getSessionQueue(threadId).enqueue(participantKey, target)
                    result.queued.push(participantKey)
                    scheduleBlockedWakeRetry(
                        participantKey,
                        actDefinition,
                        mailbox,
                        threadManager,
                        threadId,
                        workingDir,
                    )
                    return result
                }
                const ensured = prepared.payload
                // Act scope always uses build agent, ignoring performer planMode
                const buildAgent = ensured.compiled.agentNames[ACT_AGENT_POSTURE]
                if (buildAgent) agentName = buildAgent
                projectedTools = ensured.toolMap
                modelOverride = {
                    providerID: performerConfig.model.provider,
                    modelID: performerConfig.model.modelId,
                }
                serverDebug('wake-cascade', `Performer projection done for "${participantKey}" model=${performerConfig.model.modelId}`)
            } catch (projErr) {
                console.warn(`[wake-cascade] Performer projection failed for "${participantKey}", falling back to generic tools:`, projErr)
                // Fallback: write generic Act tools only
                promptText = [collaborationPromptSection, prompt].filter(Boolean).join('\n\n---\n\n')
                await writeGenericActTools(
                    executionDir,
                    threadManager.workingDir,
                )
            }
        } else {
            // No performer model — write generic Act tools only
            serverDebug('wake-cascade', `No model config for "${participantKey}", using generic Act tools only`)
            promptText = [collaborationPromptSection, prompt].filter(Boolean).join('\n\n---\n\n')
            await writeGenericActTools(
                executionDir,
                threadManager.workingDir,
            )
        }

        await oc.session.promptAsync({
            sessionID: sessionId,
            directory: executionDir,
            agent: agentName,
            model: modelOverride,
            tools: projectedTools,
            parts: [{ type: 'text', text: promptText }],
        })
        markMessagesDelivered(mailbox, participantKey)

        result.injected.push(participantKey)

        const { waitForSessionToSettle } = await import('../../lib/chat-session.js')
        void waitForSessionToSettle(
            oc,
            sessionId,
            { directory: executionDir },
            { timeoutMs: 30 * 60_000, pollMs: 250, requireObservedBusy: true },
        ).then((settled) => {
            if (!settled) {
                console.warn(`[wake-cascade] Session ${sessionId} for "${participantKey}" did not settle before timeout`)
                return drainParticipantQueueAfterSettlement(
                    participantKey,
                    actDefinition,
                    mailbox,
                    threadManager,
                    threadId,
                    workingDir,
                )
            }
            return Promise.all([
                import('../../lib/opencode-errors.js'),
                import('../../lib/chat-session.js'),
            ]).then(async ([{ unwrapOpencodeResult }, { extractNonRetryableSessionError }]) => {
                const rawMessages = unwrapOpencodeResult<unknown>(await oc.session.messages({
                    sessionID: sessionId,
                    directory: executionDir,
                }))
                const messages = Array.isArray(rawMessages) ? rawMessages : []
                const fatalError = extractNonRetryableSessionError(messages)
                if (fatalError) {
                    tripParticipantCircuit(threadId, participantKey, fatalError)
                    console.warn(
                        `[wake-cascade] Opened circuit for "${participantKey}" after non-retryable session error: ${fatalError}`,
                    )
                    return drainParticipantQueueAfterSettlement(
                        participantKey,
                        actDefinition,
                        mailbox,
                        threadManager,
                        threadId,
                        workingDir,
                    )
                }

                clearParticipantCircuit(threadId, participantKey)
                return drainParticipantQueueAfterSettlement(
                    participantKey,
                    actDefinition,
                    mailbox,
                    threadManager,
                    threadId,
                    workingDir,
                )
            })
        }).then((drainResult) => {
            if (!drainResult) {
                return
            }
            result.injected.push(...drainResult.injected)
            result.queued.push(...drainResult.queued)
            result.errors.push(...drainResult.errors)
        }).catch((settleErr) => {
            console.error(`[wake-cascade] Failed waiting for session settle for "${participantKey}":`, settleErr)
            void drainParticipantQueueAfterSettlement(
                participantKey,
                actDefinition,
                mailbox,
                threadManager,
                threadId,
                workingDir,
            )
        })

        return result
    } catch (error: unknown) {
        result.errors.push(`Wake injection failed for ${participantKey}: ${errorMessage(error)}`)
        const drainResult = await drainParticipantQueueAfterSettlement(
            participantKey,
            actDefinition,
            mailbox,
            threadManager,
            threadId,
            workingDir,
        )
        result.injected.push(...drainResult.injected)
        result.queued.push(...drainResult.queued)
        result.errors.push(...drainResult.errors)
        return result
    }
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
    workingDir: string,
): Promise<WakeCascadeResult> {
    const result = emptyWakeCascadeResult()

    // 1. Route event to matching participants
    const recentEvents = await threadManager.getRecentEvents(threadId, 20)
    const targets = routeEvent(event, actDefinition, mailbox, recentEvents)
    result.targets = targets

    serverDebug(
        'wake-cascade',
        `Event type=${event.type} source=${event.source} -> ${targets.length} targets: [${targets.map(t => t.participantKey).join(', ')}]`,
    )
    if (targets.length === 0) {
        // Keep no-match diagnostics available only in verbose mode.
        for (const [key, binding] of Object.entries(actDefinition.participants)) {
            if (key === event.source) continue
            const hasSubs = !!binding.subscriptions
            const subKeys = binding.subscriptions ? JSON.stringify(binding.subscriptions) : 'none'
            const hasRelation = actDefinition.relations.some(r => r.between.includes(key) && r.between.includes(event.source || ''))
            serverDebug('wake-cascade', `participant "${key}": subs=${hasSubs}(${subKeys}), relation=${hasRelation}`)
        }
    }

    if (targets.length === 0) return result

    // 2. Process each wake-up target
    const queue = getSessionQueue(threadId)

    for (const target of targets) {
        const participantKey = target.participantKey

        // Serialize only same-participant wake-ups.
        // Different participants may run concurrently within the same thread.
        if (queue.isRunning(participantKey)) {
            queue.enqueue(participantKey, target)
            result.queued.push(participantKey)
            continue
        }

        const injectionResult = await injectWakeTarget(
            target,
            actDefinition,
            mailbox,
            threadManager,
            threadId,
            workingDir,
        )
        result.injected.push(...injectionResult.injected)
        result.queued.push(...injectionResult.queued)
        result.errors.push(...injectionResult.errors)
    }

    return result
}
