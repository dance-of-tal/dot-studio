/**
 * usePermissionInteraction — shared hook for PermissionDock / QuestionWizard rendering.
 *
 * Encapsulates the "isResponding" local state and the decision callbacks
 * that are duplicated between PerformerChatComposer and ActChatPanel.
 */
import { useState, useCallback } from 'react'
import type { PermissionRequest, QuestionRequest, QuestionAnswer } from '@opencode-ai/sdk/v2'

interface UsePermissionInteractionParams {
    sessionId: string | null
    permissionRequest: PermissionRequest | null
    questionRequest: QuestionRequest | null
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: QuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
}

export function usePermissionInteraction({
    sessionId,
    permissionRequest,
    questionRequest,
    respondToPermission,
    respondToQuestion,
    rejectQuestion,
}: UsePermissionInteractionParams) {
    const [isResponding, setIsResponding] = useState(false)

    const handlePermissionDecide = useCallback(async (response: 'once' | 'always' | 'reject') => {
        if (!sessionId || !permissionRequest) return
        setIsResponding(true)
        await respondToPermission(sessionId, permissionRequest.id, response)
        setIsResponding(false)
    }, [sessionId, permissionRequest, respondToPermission])

    const handleQuestionRespond = useCallback(async (answers: QuestionAnswer[]) => {
        if (!sessionId || !questionRequest) return
        setIsResponding(true)
        await respondToQuestion(sessionId, questionRequest.id, answers)
        setIsResponding(false)
    }, [sessionId, questionRequest, respondToQuestion])

    const handleQuestionReject = useCallback(async () => {
        if (!sessionId || !questionRequest) return
        setIsResponding(true)
        await rejectQuestion(sessionId, questionRequest.id)
        setIsResponding(false)
    }, [sessionId, questionRequest, rejectQuestion])

    return {
        isResponding,
        permissionRequest,
        questionRequest,
        handlePermissionDecide,
        handleQuestionRespond,
        handleQuestionReject,
    }
}
