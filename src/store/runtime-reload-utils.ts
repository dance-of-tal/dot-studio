import type { StudioState } from './types'
import { resolveSessionActivity } from './session/session-activity'

export function isStudioSessionRunning(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses' | 'seMessages' | 'sePermissions' | 'seQuestions'>,
    sessionId: string,
) {
    return resolveSessionActivity({
        loading: !!state.sessionLoading?.[sessionId],
        status: state.seStatuses?.[sessionId],
        messages: state.seMessages?.[sessionId] || [],
        permission: state.sePermissions?.[sessionId] || null,
        question: state.seQuestions?.[sessionId] || null,
    }).isActive
}

export function collectRunningStudioSessionIds(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses' | 'seMessages' | 'sePermissions' | 'seQuestions'>,
) {
    const sessionIds = new Set<string>([
        ...Object.keys(state.sessionLoading || {}),
        ...Object.keys(state.seStatuses || {}),
    ])

    return Array.from(sessionIds).filter((sessionId) => isStudioSessionRunning(state, sessionId))
}

export function hasRunningStudioSessions(
    state: Pick<StudioState, 'sessionLoading' | 'seStatuses' | 'seMessages' | 'sePermissions' | 'seQuestions'>,
) {
    return collectRunningStudioSessionIds(state).length > 0
}
