/**
 * delegate-service.ts — Act relation delegation via OpenCode SDK
 *
 * Custom tools call POST /api/act/delegate which routes here.
 * Manages: session creation/reuse, call counting, timeout, async fire-and-forget.
 */

import { getOpencode } from '../lib/opencode.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'

// ── In-memory state ─────────────────────────────────────

/** Per-relation call counter: key = `${actId}:${relationId}` */
const callCounters = new Map<string, number>()

/** Per-relation session reuse map: key = `${actId}:${relationId}:${callerSessionId}` → sessionId */
const reuseSessions = new Map<string, string>()

export function resetDelegateState() {
    callCounters.clear()
    reuseSessions.clear()
}

// ── Types ───────────────────────────────────────────────

export interface DelegateRequest {
    actId: string
    relationId: string
    callerSessionId: string
    prompt: string
    /** Target agent name (projected by act-compiler) */
    targetAgentName: string
    description: string
    awaitResult: boolean
    sessionPolicy: 'fresh' | 'reuse'
    maxCalls: number
    timeout: number
}

export interface DelegateResult {
    ok: boolean
    result?: string
    error?: string
    sessionId?: string
}

// ── Core ────────────────────────────────────────────────

export async function delegateToPerformer(
    workingDir: string,
    request: DelegateRequest,
): Promise<DelegateResult> {
    const counterKey = `${request.actId}:${request.relationId}`

    // ── maxCalls check ──────────────────────────────────
    const currentCount = callCounters.get(counterKey) || 0
    if (currentCount >= request.maxCalls) {
        return {
            ok: false,
            error: `Maximum call limit reached (${request.maxCalls}). Proceed with what you have.`,
        }
    }
    callCounters.set(counterKey, currentCount + 1)

    // ── Session resolution ──────────────────────────────
    const oc = await getOpencode()
    let sessionId: string

    if (request.sessionPolicy === 'reuse') {
        const reuseKey = `${request.actId}:${request.relationId}:${request.callerSessionId}`
        const existingSessionId = reuseSessions.get(reuseKey)

        if (existingSessionId) {
            sessionId = existingSessionId
        } else {
            const session = unwrapOpencodeResult<{ id: string }>(await oc.session.create({
                directory: workingDir,
                title: `[Act delegate] ${request.description || request.targetAgentName}`,
            }))
            sessionId = session.id
            reuseSessions.set(reuseKey, sessionId)
        }
    } else {
        const session = unwrapOpencodeResult<{ id: string }>(await oc.session.create({
            directory: workingDir,
            title: `[Act delegate] ${request.description || request.targetAgentName}`,
        }))
        sessionId = session.id
    }

    // ── Fire-and-forget (await: false) ──────────────────
    if (!request.awaitResult) {
        oc.session.promptAsync({
            sessionID: sessionId,
            directory: workingDir,
            agent: request.targetAgentName,
            parts: [{ type: 'text', text: request.prompt }],
        }).catch((err: unknown) => {
            console.error(`[delegate] fire-and-forget error for ${counterKey}:`, err)
        })

        return {
            ok: true,
            result: `Delegation sent to ${request.targetAgentName}. Proceeding without waiting for result.`,
            sessionId,
        }
    }

    // ── Await result with timeout ───────────────────────
    const timer = setTimeout(() => {}, request.timeout * 1000)

    try {
        // Start the prompt
        unwrapOpencodeResult(await oc.session.promptAsync({
            sessionID: sessionId,
            directory: workingDir,
            agent: request.targetAgentName,
            parts: [{ type: 'text', text: request.prompt }],
        }))

        // Wait for session to become idle by polling status
        const maxWait = request.timeout * 1000
        const startTime = Date.now()
        const pollInterval = 2000

        while (Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval))

            try {
                const statuses = unwrapOpencodeResult<Record<string, { type: string }>>(
                    await oc.session.status({ directory: workingDir }),
                )
                const sessionStatus = statuses?.[sessionId]
                if (sessionStatus && sessionStatus.type === 'idle') {
                    break
                }
            } catch {
                // Status call failed, keep polling
            }
        }

        if (Date.now() - startTime >= maxWait) {
            return {
                ok: false,
                error: `Delegation to ${request.targetAgentName} timed out after ${request.timeout} seconds.`,
                sessionId,
            }
        }

        // Read the last assistant message
        const messages = unwrapOpencodeResult<any[]>(await oc.session.messages({
            sessionID: sessionId,
            directory: workingDir,
        }))

        if (Array.isArray(messages) && messages.length > 0) {
            const lastAssistantMsg = [...messages].reverse().find(
                (m: any) => m.role === 'assistant',
            )
            if (lastAssistantMsg) {
                const parts = lastAssistantMsg.parts || []
                const textPart = parts.find((p: any) => p.type === 'text')
                if (textPart) {
                    return {
                        ok: true,
                        result: textPart.text,
                        sessionId,
                    }
                }
            }
        }

        return {
            ok: true,
            result: `Delegation to ${request.targetAgentName} completed, but no text response was returned.`,
            sessionId,
        }
    } catch (err) {
        return {
            ok: false,
            error: `Delegation to ${request.targetAgentName} failed: ${err instanceof Error ? err.message : String(err)}`,
            sessionId,
        }
    } finally {
        clearTimeout(timer)
    }
}
