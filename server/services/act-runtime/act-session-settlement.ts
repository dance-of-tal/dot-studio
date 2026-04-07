import type { getOpencode } from '../../lib/opencode.js'
import { extractNonRetryableSessionError, waitForSessionToSettle } from '../../lib/chat-session.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'

export type ActSessionSettlementOutcome =
    | { kind: 'idle' }
    | { kind: 'timeout'; message: string }
    | { kind: 'fatal_error'; message: string }

export function formatActSessionError(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

export async function resolveActSessionSettlementOutcome(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    sessionId: string,
    directory: string,
    options?: {
        timeoutMs?: number
        pollMs?: number
        requireObservedBusy?: boolean
    },
): Promise<ActSessionSettlementOutcome> {
    const settled = await waitForSessionToSettle(
        oc,
        sessionId,
        { directory },
        options,
    )

    if (!settled) {
        return {
            kind: 'timeout',
            message: 'Session did not settle before timeout.',
        }
    }

    const rawMessages = unwrapOpencodeResult<unknown>(await oc.session.messages({
        sessionID: sessionId,
        directory,
    }))
    const messages = Array.isArray(rawMessages) ? rawMessages : []
    const fatalError = extractNonRetryableSessionError(messages)
    if (fatalError) {
        return {
            kind: 'fatal_error',
            message: fatalError,
        }
    }

    return { kind: 'idle' }
}
