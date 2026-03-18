// Chat Session Routes (OpenCode proxy)

import { Hono } from 'hono'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { uniqueAssetRefs } from '../lib/chat-session.js'
import { createStudioChatSession, sendStudioChatMessage } from '../services/chat-service.js'
import { resolveSessionExecutionContext } from '../lib/session-execution.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { createSSEResponse } from '../lib/sse.js'
import {
    abortStudioChatSession,
    deleteStudioChatSession,
    listStudioChatSessions,
    listStudioSessionDiff,
    listStudioSessionMessages,
    listStudioSessionTodos,
    rejectQuestion,
    renameStudioChatSession,
    respondQuestion,
    respondSessionPermission,
    revertStudioChatSession,
    shareStudioChatSession,
    summarizeStudioChatSession,
} from '../services/chat-session-service.js'
import { buildStudioChatEventStream } from '../services/chat-event-stream-service.js'

const chat = new Hono()

// ── Create Session ──────────────────────────────────────
chat.post('/api/chat/sessions', async (c) => {
    const body = await c.req.json<ChatSessionCreateRequest>()
    try {
        return c.json(await createStudioChatSession(resolveRequestWorkingDir(c), body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Delete Session ──────────────────────────────────────
chat.delete('/api/chat/sessions/:id', async (c) => {
    try {
        return c.json(await deleteStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chat.put('/api/chat/sessions/:id', async (c) => {
    const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))
    const title = body.title
    if (!title || !title.trim()) {
        return jsonOpencodeError(
            c,
            new StudioValidationError('Thread title is required.', 'fix_input'),
        )
    }

    try {
        return c.json(await renameStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id'), title.trim()))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Send message ────────────────────────────────────────
chat.post('/api/chat/sessions/:id/send', async (c) => {
    const body = await c.req.json<ChatSendRequest>()

    if (!body.performer?.model) {
        return jsonOpencodeError(
            c,
            new StudioValidationError(
                'Select a model for this performer before sending prompts.',
                'select_model',
            ),
        )
    }

    try {
        const workingDir = resolveRequestWorkingDir(c)
        const executionDir = (await resolveSessionExecutionContext(c.req.param('id')))?.executionDir || workingDir
        const normalizedBody: ChatSendRequest = {
            ...body,
            performer: {
                ...body.performer,
                danceRefs: uniqueAssetRefs(body.performer?.danceRefs || []),
                extraDanceRefs: uniqueAssetRefs(body.performer?.extraDanceRefs || []),
            },
        }
        const result = await sendStudioChatMessage(executionDir, workingDir, c.req.param('id'), normalizedBody)
        return c.json(result, 202)
    } catch (err) {
        return jsonOpencodeError(c, err, { model: body.performer?.model })
    }
})

// ── Abort ───────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/abort', async (c) => {
    try {
        return c.json(await abortStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Permissions ─────────────────────────────────────────
chat.post('/api/chat/sessions/:id/permission/:pid/respond', async (c) => {
    const { response } = await c.req.json<{ response: 'once' | 'always' | 'reject' }>()
    try {
        return c.json(await respondSessionPermission(resolveRequestWorkingDir(c), c.req.param('id'), c.req.param('pid'), response))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Questions ───────────────────────────────────────────
chat.post('/api/chat/questions/:qid/respond', async (c) => {
    const { answers } = await c.req.json<{ answers: any[] }>()
    try {
        return c.json(await respondQuestion(c.req.param('qid'), answers))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chat.post('/api/chat/questions/:qid/reject', async (c) => {
    try {
        return c.json(await rejectQuestion(c.req.param('qid')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── SSE event stream ────────────────────────────────────
chat.get('/api/chat/events', async (c) => {
    try {
        return createSSEResponse(await buildStudioChatEventStream(resolveRequestWorkingDir(c), c.req.raw.signal))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

// ── Messages ────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/messages', async (c) => {
    try {
        return c.json(await listStudioSessionMessages(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Diff ────────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/diff', async (c) => {
    try {
        return c.json(await listStudioSessionDiff(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── TODO ────────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/todo', async (c) => {
    try {
        return c.json(await listStudioSessionTodos(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Share ───────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/share', async (c) => {
    try {
        return c.json(await shareStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Summarize ───────────────────────────────────────────
chat.post('/api/chat/sessions/:id/summarize', async (c) => {
    const { providerID, modelID, auto } = await c.req.json<{
        providerID?: string
        modelID?: string
        auto?: boolean
    }>()
    try {
        return c.json(await summarizeStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id'), { providerID, modelID, auto }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Revert ──────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/revert', async (c) => {
    const { messageId, partId } = await c.req.json<{ messageId: string; partId?: string }>()
    try {
        return c.json(await revertStudioChatSession(resolveRequestWorkingDir(c), c.req.param('id'), { messageId, partId }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── List all sessions ───────────────────────────────────
chat.get('/api/chat/sessions', async (c) => {
    try {
        return c.json(await listStudioChatSessions(resolveRequestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chat
