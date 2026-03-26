import { unwrapOpencodeResult } from './opencode-errors.js'
import { getOpencode } from './opencode.js'
import { requestDirectoryQuery } from './request-context.js'

type ToolPartStateLike = {
    status?: string
    error?: string
    time?: Record<string, unknown>
} & Record<string, unknown>

type ToolPartLike = {
    type?: string
    state?: ToolPartStateLike
} & Record<string, unknown>

type MessageWithParts = {
    info?: {
        role?: string
        error?: unknown
    }
    role?: string
    parts?: unknown[]
} & Record<string, unknown>

function isToolPartLike(value: unknown): value is ToolPartLike {
    return !!value && typeof value === 'object'
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function normalizeIncompleteToolParts<T extends MessageWithParts>(messages: T[], settledAt: number): T[] {
    return messages.map((message) => {
        if (!Array.isArray(message?.parts) || message.parts.length === 0) {
            return message
        }

        const nextParts = message.parts.map((part) => {
            if (!isToolPartLike(part) || part.type !== 'tool' || !part.state) {
                return part
            }
            const status = part.state.status
            if (status !== 'pending' && status !== 'running') {
                return part
            }
            return {
                ...part,
                state: {
                    ...part.state,
                    status: 'error',
                    error: part.state.error || 'Stopped before the tool finished.',
                    time: {
                        ...(part.state.time || {}),
                        ...(typeof part.state.time?.start === 'number' ? {} : { start: settledAt }),
                        end: settledAt,
                    },
                },
            }
        })

        return {
            ...message,
            parts: nextParts,
        } as T
    })
}

export async function waitForSessionToSettle(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    sessionId: string,
    directoryQuery: ReturnType<typeof requestDirectoryQuery>,
    options?: {
        timeoutMs?: number
        pollMs?: number
        requireObservedBusy?: boolean
    },
) {
    const deadline = Date.now() + (options?.timeoutMs ?? 3_000)
    let observedBusy = false
    while (Date.now() < deadline) {
        const statuses = unwrapOpencodeResult<Record<string, { type: 'idle' | 'busy' | 'retry' }>>(await oc.session.status({
            ...directoryQuery,
        }))
        const status = statuses?.[sessionId]
        if (status?.type === 'busy' || status?.type === 'retry') {
            observedBusy = true
        }
        if (status?.type === 'idle') {
            return true
        }
        if (!status && (!options?.requireObservedBusy || observedBusy)) {
            return true
        }
        await sleep(options?.pollMs ?? 150)
    }
    return false
}

export function extractNonRetryableSessionError(messages: MessageWithParts[]): string | null {
    const lastAssistant = [...messages]
        .reverse()
        .find((message) => (message.info?.role || message.role) === 'assistant')

    const error = lastAssistant?.info?.error
    if (!error || typeof error !== 'object') {
        return null
    }

    const retryable = (
        'data' in error
        && error.data
        && typeof error.data === 'object'
        && 'isRetryable' in error.data
        && typeof error.data.isRetryable === 'boolean'
    )
        ? error.data.isRetryable
        : undefined

    const message = (
        'data' in error
        && error.data
        && typeof error.data === 'object'
        && 'message' in error.data
        && typeof error.data.message === 'string'
    )
        ? error.data.message
        : ('message' in error && typeof error.message === 'string' ? error.message : null)

    if (retryable === false) {
        return message || 'Non-retryable session error.'
    }

    return null
}

export function uniqueAssetRefs(
    refs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
) {
    const seen = new Set<string>()
    return refs.filter((ref) => {
        const key = ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}
