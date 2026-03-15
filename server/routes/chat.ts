// Chat Session Routes (OpenCode proxy)

import { Hono, type Context } from 'hono'
import { getOpencode } from '../lib/opencode.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { normalizeIncompleteToolParts, uniqueAssetRefs, waitForSessionToSettle } from '../lib/chat-session.js'
import { createStudioChatSession, sendStudioChatMessage } from '../services/chat-service.js'
import {
    cloneSessionExecutionContext,
    listSessionExecutionContextsForWorkingDir,
    resolveSessionExecutionContext,
    unregisterSessionExecutionContext,
} from '../lib/session-execution.js'
import {
    StudioValidationError,
    jsonOpencodeError,
    unwrapOpencodeResult,
} from '../lib/opencode-errors.js'
import { createSSEResponse, sseEncode } from '../lib/sse.js'

const chat = new Hono()

async function directoryQueryForSession(c: Context, sessionId: string) {
    const context = await resolveSessionExecutionContext(sessionId)
    return {
        directory: context?.executionDir || resolveRequestWorkingDir(c),
    }
}

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
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        unwrapOpencodeResult(await oc.session.delete({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        await unregisterSessionExecutionContext(c.req.param('id'))
        return c.json({ ok: true })
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
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const updated = unwrapOpencodeResult(await oc.session.update({
            sessionID: c.req.param('id'),
            ...directoryQuery,
            title: title.trim(),
        }))
        return c.json(updated)
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
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        unwrapOpencodeResult(await oc.session.abort({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        await waitForSessionToSettle(oc, c.req.param('id'), directoryQuery).catch(() => { })
        return c.json({ ok: true })
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── SSE event stream ────────────────────────────────────
chat.get('/api/chat/events', async (c) => {
    try {
        const oc = await getOpencode()
        const workingDir = resolveRequestWorkingDir(c)
        const extraDirs = await listSessionExecutionContextsForWorkingDir(workingDir, 'performer')
        const directories = Array.from(new Set([
            workingDir,
            ...extraDirs.map((context) => context.executionDir),
        ]))
        const subscriptions = await Promise.all(
            directories.map((directory) => oc.event.subscribe({ directory })),
        )

        const stream = new ReadableStream({
            async start(controller) {
                let active = true
                let completed = 0
                const close = () => {
                    if (!active) {
                        return
                    }
                    active = false
                    try {
                        controller.close()
                    } catch {
                        // Stream may already be closed.
                    }
                }

                c.req.raw.signal?.addEventListener('abort', close, { once: true })

                for (const events of subscriptions) {
                    void (async () => {
                        try {
                            for await (const event of events.stream) {
                                if (!active) {
                                    return
                                }
                                controller.enqueue(sseEncode(JSON.stringify(event)))
                            }
                        } catch {
                            // Ignore broken subscriptions and keep the stream alive for the rest.
                        } finally {
                            completed += 1
                            if (completed === subscriptions.length) {
                                close()
                            }
                        }
                    })()
                }
            },
        })

        return createSSEResponse(stream)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

// ── Messages ────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/messages', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const sessionId = c.req.param('id')
        const data = unwrapOpencodeResult<any[]>(await oc.session.messages({
            sessionID: sessionId,
            ...directoryQuery,
        }))
        const statuses = unwrapOpencodeResult<Record<string, { type: 'idle' | 'busy' | 'retry' }>>(await oc.session.status({
            ...directoryQuery,
        }))
        const status = statuses?.[sessionId]
        const normalized = !status || status.type === 'idle'
            ? normalizeIncompleteToolParts(data || [], Date.now())
            : (data || [])
        return c.json(normalized)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Diff ────────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/diff', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<any[]>(await oc.session.diff({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        return c.json(data || [])
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── TODO ────────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/todo', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<any[]>(await oc.session.todo({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        return c.json(data || [])
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Fork ────────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/fork', async (c) => {
    const { messageId } = await c.req.json<{ messageId: string }>()
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<any>(await oc.session.fork({
            sessionID: c.req.param('id'),
            ...directoryQuery,
            messageID: messageId,
        }))
        const nextSessionId = data?.id || data?.sessionId
        if (typeof nextSessionId === 'string' && nextSessionId) {
            await cloneSessionExecutionContext(c.req.param('id'), nextSessionId)
        }
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Share ───────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/share', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<any>(await oc.session.share({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        return c.json(data)
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
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<boolean>(await oc.session.summarize({
            sessionID: c.req.param('id'),
            ...directoryQuery,
            ...(providerID && modelID ? { providerID, modelID } : {}),
            ...(typeof auto === 'boolean' ? { auto } : {}),
        }))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Revert ──────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/revert', async (c) => {
    const { messageId, partId } = await c.req.json<{ messageId: string; partId?: string }>()
    try {
        const oc = await getOpencode()
        const directoryQuery = await directoryQueryForSession(c, c.req.param('id'))
        const data = unwrapOpencodeResult<any>(await oc.session.revert({
            sessionID: c.req.param('id'),
            ...directoryQuery,
            messageID: messageId,
            ...(partId ? { partID: partId } : {}),
        }))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── List all sessions ───────────────────────────────────
chat.get('/api/chat/sessions', async (c) => {
    try {
        const oc = await getOpencode()
        const workingDir = resolveRequestWorkingDir(c)
        const executionContexts = await listSessionExecutionContextsForWorkingDir(workingDir, 'performer')
        const directories = Array.from(new Set([
            workingDir,
            ...executionContexts.map((context) => context.executionDir),
        ]))
        const lists = await Promise.all(
            directories.map(async (directory) => unwrapOpencodeResult<any[]>(await oc.session.list({ directory }))),
        )
        const sessions = new Map<string, any>()
        for (const list of lists) {
            for (const session of list || []) {
                if (!session?.id) {
                    continue
                }
                sessions.set(session.id, session)
            }
        }
        return c.json(Array.from(sessions.values()))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chat
