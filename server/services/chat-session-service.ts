import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import { getOpencode } from '../lib/opencode.js'
import {
    listSessionExecutionContextsForWorkingDir,
    resolveSessionExecutionContext,
    unregisterSessionExecutionContext,
} from '../lib/session-execution.js'
import { normalizeIncompleteToolParts, waitForSessionToSettle } from '../lib/chat-session.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'

type OpenCodeSessionSummary = {
    id: string
    title?: string
    createdAt?: number
} & Record<string, unknown>

type SessionMessageLike = {
    parts?: unknown[]
} & Record<string, unknown>

export async function directoryQueryForSession(workingDir: string, sessionId: string): Promise<{ directory: string }> {
    const context = await resolveSessionExecutionContext(sessionId)
    return {
        directory: context?.executionDir || workingDir,
    }
}

export async function deleteStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.delete({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await unregisterSessionExecutionContext(sessionId)
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

export async function abortStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.abort({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await waitForSessionToSettle(oc, sessionId, directoryQuery).catch(() => {})
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

export async function listStudioSessionMessages(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const data = unwrapOpencodeResult<SessionMessageLike[]>(await oc.session.messages({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    const statuses = unwrapOpencodeResult<Record<string, { type: 'idle' | 'busy' | 'retry' }>>(await oc.session.status({
        ...directoryQuery,
    }))
    const status = statuses?.[sessionId]
    return !status || status.type === 'idle'
        ? normalizeIncompleteToolParts(data || [], Date.now())
        : (data || [])
}

export async function listStudioSessionDiff(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<Array<Record<string, unknown>>>(await oc.session.diff({
        sessionID: sessionId,
        ...directoryQuery,
    })) || []
}

export async function shareStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return unwrapOpencodeResult<Record<string, unknown>>(await oc.session.share({
        sessionID: sessionId,
        ...directoryQuery,
    }))
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

export async function listStudioChatSessions(workingDir: string) {
    const oc = await getOpencode()
    const performerContexts = await listSessionExecutionContextsForWorkingDir(workingDir, 'performer')
    const actContexts = await listSessionExecutionContextsForWorkingDir(workingDir, 'act')
    const directories = Array.from(new Set([
        workingDir,
        ...performerContexts.map((context) => context.executionDir),
        ...actContexts.map((context) => context.executionDir),
    ]))
    const lists = await Promise.all(
        directories.map(async (directory) => unwrapOpencodeResult<OpenCodeSessionSummary[]>(await oc.session.list({ directory }))),
    )
    const sessions = new Map<string, OpenCodeSessionSummary>()
    for (const list of lists) {
        for (const session of list || []) {
            if (!session?.id) continue
            sessions.set(session.id, session)
        }
    }
    return Array.from(sessions.values())
}
