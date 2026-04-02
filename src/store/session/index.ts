/**
 * Session store module barrel export.
 */
export type {
    SessionEntity,
    SessionStatus,
    SessionStatusType,
    SessionEntityState,
    SessionEntityActions,
    SessionSlice,
} from './types'

export { createSessionSlice, IDLE_STATUS } from './session-entity-store'

export {
    selectSessionIdForChatKey,
    selectChatKeyForSession,
    selectStreamTarget,
    selectMessagesForChatKey,
    selectPrefixCountForChatKey,
    selectMessagesForSession,
    selectSessionStatus,
    selectSessionIsLoading,
    selectChatKeyIsLoading,
    selectPendingPermission,
    selectPendingQuestion,
    selectTodos,
    selectSessionRevert,
    selectChatSessionState,
} from './session-selectors'

export type { SessionStreamTarget } from './session-selectors'

export { createEventIngest } from './event-ingest'
export {
    registerSessionBinding,
    detachChatSession,
    syncSessionSnapshot,
    bindExistingSession,
    createFreshSessionBinding,
    ensureSession,
    appendLocalMessage,
    appendSystemNotice,
    moveDraftMessageToSession,
    clearChatSessionView,
    resolveChatKeySession,
} from './session-commands'

export {
    reduceMessageUpdated,
    reduceMessageRemoved,
    reduceMessagePartUpdated,
    reduceMessagePartDelta,
    reduceMessagePartRemoved,
    reduceSessionStatus,
    reduceSessionError,
    reducePermissionAsked,
    reducePermissionReplied,
    reduceQuestionAsked,
    reduceQuestionReplied,
    reduceTodoUpdated,
} from './event-reducer'
