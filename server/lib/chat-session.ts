import { unwrapOpencodeResult } from './opencode-errors.js'
import { getOpencode } from './opencode.js'
import { requestDirectoryQuery } from './request-context.js'

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function normalizeIncompleteToolParts(messages: any[], settledAt: number) {
    return messages.map((message) => {
        if (!Array.isArray(message?.parts) || message.parts.length === 0) {
            return message
        }

        const nextParts = message.parts.map((part: any) => {
            if (part?.type !== 'tool' || !part.state) {
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
        }
    })
}

export async function waitForSessionToSettle(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    sessionId: string,
    directoryQuery: ReturnType<typeof requestDirectoryQuery>,
) {
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
        const statuses = unwrapOpencodeResult<Record<string, { type: 'idle' | 'busy' | 'retry' }>>(await oc.session.status({
            ...directoryQuery,
        }))
        const status = statuses?.[sessionId]
        if (!status || status.type === 'idle') {
            return
        }
        await sleep(150)
    }
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
