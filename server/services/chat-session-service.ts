import type { QuestionAnswer, PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import { getOpencode } from '../lib/opencode.js'
import {
    deriveImplicitIdleSessionState,
    normalizeIncompleteToolParts,
    waitForSessionToSettle,
} from '../lib/chat-session.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { syncActParticipantStatusForSession } from './act-runtime/act-session-runtime.js'
import { responseData } from './opencode-service.js'
import { deleteSessionOwnership } from './session-ownership-service.js'

type OpenCodeSessionSummary = {
    id: string
    title?: string
    createdAt?: number
    updatedAt?: number
    parentId?: string | null
    status?: 'idle' | 'busy' | 'retry' | 'error'
} & Record<string, unknown>

type OpenCodeRawSessionSummary = {
    id: string
    title?: string
    createdAt?: number
    updatedAt?: number
    parentID?: string | null
    time?: {
        created?: number
        updated?: number
    }
} & Record<string, unknown>

type OpenCodeSessionStatus = {
    type: 'idle' | 'busy' | 'retry' | 'error'
} & Record<string, unknown>

type SessionMessageLike = {
    parts?: unknown[]
} & Record<string, unknown>

type ListSessionMessagesOptions = {
    limit?: number
    before?: string
}

type ListSessionMessagesResult = {
    messages: SessionMessageLike[]
    nextCursor: string | null
}

function readResponseHeader(result: unknown, name: string): string | null {
    if (!result || typeof result !== 'object') {
        return null
    }

    const response = (result as { response?: { headers?: { get?: (name: string) => string | null } } }).response
    if (!response?.headers || typeof response.headers.get !== 'function') {
        return null
    }

    const value = response.headers.get(name)
    if (!value) {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function directoryQueryForSession(workingDir: string, sessionId: string): Promise<{ directory: string }> {
    void sessionId
    return {
        directory: workingDir,
    }
}

export async function deleteStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.delete({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await deleteSessionOwnership(sessionId)
    return { ok: true as const }
}

export async function renameStudioChatSession(workingDir: string, sessionId: string, title: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult(await oc.session.update({
        sessionID: sessionId,
        ...directoryQuery,
        title,
    }))
}

export async function getStudioChatSessionStatus(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const statuses = unwrapOpencodeResult<Record<string, OpenCodeSessionStatus>>(await oc.session.status({
        ...directoryQuery,
    })) || {}
    const directStatus = statuses[sessionId] || null
    if (directStatus) {
        return {
            status: directStatus,
        }
    }

    const rawMessages = unwrapOpencodeResult<SessionMessageLike[]>(await oc.session.messages({
        sessionID: sessionId,
        ...directoryQuery,
    })) || []
    return {
        status: deriveImplicitIdleSessionState(rawMessages).status,
    }
}

export async function abortStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.abort({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await waitForSessionToSettle(oc, sessionId, directoryQuery).catch(() => {})
    await syncActParticipantStatusForSession(sessionId, { type: 'idle' }).catch(() => {})
    return { ok: true as const }
}

export async function respondSessionPermission(workingDir: string, sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.permission.respond({
        ...directoryQuery,
        sessionID: sessionId,
        permissionID: permissionId,
        response,
    }))
    return { ok: true as const }
}

export async function respondQuestion(questionId: string, answers: QuestionAnswer[]) {
    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.question.reply({
        requestID: questionId,
        answers,
    }))
    return { ok: true as const }
}

export async function rejectQuestion(questionId: string) {
    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.question.reject({
        requestID: questionId,
    }))
    return { ok: true as const }
}

export async function listPendingPermissions(workingDir: string) {
    const oc = await getOpencode()
    const res = await oc.permission.list({ directory: workingDir })
    return responseData<PermissionRequest[]>(res, [])
}

export async function listPendingQuestions(workingDir: string) {
    const oc = await getOpencode()
    const res = await oc.question.list({ directory: workingDir })
    return responseData<QuestionRequest[]>(res, [])
}

export async function listStudioSessionMessages(
    workingDir: string,
    sessionId: string,
    options: ListSessionMessagesOptions = {},
): Promise<ListSessionMessagesResult> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const params: Record<string, unknown> = {
        sessionID: sessionId,
        ...directoryQuery,
    }
    if (typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
        params.limit = options.limit
    }
    if (typeof options.before === 'string' && options.before.trim()) {
        params.$query_before = options.before.trim()
    }

    const messageResult = await oc.session.messages(params as { sessionID: string; directory?: string; limit?: number })
    const data = unwrapOpencodeResult<SessionMessageLike[]>(messageResult)
    const statuses = unwrapOpencodeResult<Record<string, OpenCodeSessionStatus>>(await oc.session.status({
        ...directoryQuery,
    }))
    const status = statuses?.[sessionId]
    const messages = !status || status.type === 'idle'
        ? normalizeIncompleteToolParts(data || [], Date.now())
        : (data || [])
    return {
        messages,
        nextCursor: readResponseHeader(messageResult, 'x-next-cursor'),
    }
}

export async function listStudioSessionDiff(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<Array<Record<string, unknown>>>(await oc.session.diff({
        sessionID: sessionId,
        ...directoryQuery,
    })) || []
}

export async function summarizeStudioChatSession(
    workingDir: string,
    sessionId: string,
    options: { providerID?: string; modelID?: string; auto?: boolean },
) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<boolean>(await oc.session.summarize({
        sessionID: sessionId,
        ...directoryQuery,
        ...(options.providerID && options.modelID ? { providerID: options.providerID, modelID: options.modelID } : {}),
        ...(typeof options.auto === 'boolean' ? { auto: options.auto } : {}),
    }))
}

export async function revertStudioChatSession(
    workingDir: string,
    sessionId: string,
    input: { messageId: string; partId?: string },
) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<Record<string, unknown>>(await oc.session.revert({
        sessionID: sessionId,
        ...directoryQuery,
        messageID: input.messageId,
        ...(input.partId ? { partID: input.partId } : {}),
    }))
}

export async function unrevertStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<Record<string, unknown>>(await oc.session.unrevert({
        sessionID: sessionId,
        ...directoryQuery,
    }))
}

export async function listStudioChatSessions(workingDir: string) {
    const oc = await getOpencode()
    const directories = [workingDir]
    const directoryData = await Promise.all(
        directories.map(async (directory) => {
            const [sessions, statuses] = await Promise.all([
                unwrapOpencodeResult<OpenCodeRawSessionSummary[]>(await oc.session.list({ directory })),
                unwrapOpencodeResult<Record<string, OpenCodeSessionStatus>>(await oc.session.status({ directory })),
            ])
            return {
                sessions: sessions || [],
                statuses: statuses || {},
            }
        }),
    )
    const sessions = new Map<string, OpenCodeSessionSummary>()
    for (const entry of directoryData) {
        for (const session of entry.sessions) {
            if (!session?.id) continue
            const normalized: OpenCodeSessionSummary = {
                ...session,
                createdAt: typeof session.createdAt === 'number' ? session.createdAt : session.time?.created,
                updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : session.time?.updated,
                parentId: typeof session.parentID === 'string' ? session.parentID : null,
                status: entry.statuses[session.id]?.type,
            }
            const existing = sessions.get(session.id)
            const existingUpdatedAt = existing?.updatedAt || 0
            const nextUpdatedAt = normalized.updatedAt || 0
            if (!existing || nextUpdatedAt >= existingUpdatedAt) {
                sessions.set(session.id, normalized)
            }
        }
    }
    return Array.from(sessions.values())
}
