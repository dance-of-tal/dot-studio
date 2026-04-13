import { useEffect } from 'react'
import { showToast } from '../../lib/toast'
import type { ChatMessage } from '../../types'
import { applyAssistantActions } from './assistant-actions'
import { getPendingAssistantToolMessages } from './assistant-protocol'

export function useAssistantToolApplication({
    messages,
    appliedAssistantActionMessageIds,
    markAssistantActionsApplied,
    recordAssistantActionResult,
}: {
    messages: ChatMessage[]
    appliedAssistantActionMessageIds: Record<string, true>
    markAssistantActionsApplied: (messageId: string) => void
    recordAssistantActionResult: (messageId: string, result: { applied: number; failed: number }) => void
}) {
    useEffect(() => {
        let cancelled = false

        void (async () => {
            const pendingMessages = getPendingAssistantToolMessages(messages, appliedAssistantActionMessageIds)
            for (const message of pendingMessages) {
                if (cancelled) {
                    return
                }

                markAssistantActionsApplied(message.messageId)
                let summary = { applied: 0, failed: 0 }

                for (const call of message.actionCalls) {
                    const result = await applyAssistantActions(call.actions)
                    summary = {
                        applied: summary.applied + result.applied,
                        failed: summary.failed + result.failed,
                    }
                }

                if (cancelled) {
                    return
                }

                recordAssistantActionResult(message.messageId, summary)
                if (summary.failed > 0) {
                    showToast(
                        summary.applied > 0
                            ? `Studio Assistant applied ${summary.applied} change(s), but ${summary.failed} action(s) could not be applied.`
                            : 'Studio Assistant suggested changes, but they could not be applied to the current stage.',
                        summary.applied > 0 ? 'warning' : 'error',
                        {
                            title: 'Assistant mutation issue',
                            dedupeKey: `assistant-mutations:${message.messageId}`,
                        },
                    )
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [
        appliedAssistantActionMessageIds,
        markAssistantActionsApplied,
        messages,
        recordAssistantActionResult,
    ])
}
