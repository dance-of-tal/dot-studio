// Chat Session Routes (OpenCode proxy)

import { Hono } from 'hono'
import { getOpencode } from '../lib/opencode.js'
import { compilePrompt } from './compile.js'
import type { DanceDeliveryMode, ModelSelection } from '../lib/prompt.js'
import { buildEnabledToolMap, describeUnavailableRuntimeTools, resolveRuntimeTools } from '../lib/runtime-tools.js'
import { requestDirectoryQuery, resolveRequestWorkingDir } from '../lib/request-context.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import { normalizeIncompleteToolParts, uniqueAssetRefs, waitForSessionToSettle } from '../lib/chat-session.js'
import {
    StudioValidationError,
    jsonOpencodeError,
    unwrapOpencodeResult,
} from '../lib/opencode-errors.js'

const chat = new Hono()

// ── Create Session ──────────────────────────────────────
chat.post('/api/chat/sessions', async (c) => {
    const { performerId, performerName, configHash } = await c.req.json<{
        performerId: string
        performerName: string
        configHash: string
    }>()
    try {
        const oc = await getOpencode()
        const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
            ...requestDirectoryQuery(c),
            title: buildStudioSessionTitle(performerId, performerName, configHash),
        }))
        return c.json({
            sessionId: session.id,
            title: session.title,
        })
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Delete Session ──────────────────────────────────────
chat.delete('/api/chat/sessions/:id', async (c) => {
    try {
        const oc = await getOpencode()
        unwrapOpencodeResult(await oc.session.delete({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
        }))
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
        const updated = unwrapOpencodeResult(await oc.session.update({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
            title: title.trim(),
        }))
        return c.json(updated)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Send message ────────────────────────────────────────
chat.post('/api/chat/sessions/:id/send', async (c) => {
    const { message, performer, attachments } = await c.req.json<{
        message: string
        performer: {
            talRef: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null
            danceRefs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>
            extraDanceRefs?: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>
            drafts?: Record<string, { id: string; kind: 'tal' | 'dance' | 'performer' | 'act'; name: string; content: unknown; description?: string; derivedFrom?: string | null }>
            model?: ModelSelection
            modelVariant?: string | null
            agentId?: string | null
            mcpServerNames?: string[]
            danceDeliveryMode?: DanceDeliveryMode
            planMode?: boolean
            configHash?: string
        }
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
    }>()

    if (!performer?.model) {
        return jsonOpencodeError(
            c,
            new StudioValidationError(
                'Select a model for this performer before sending prompts.',
                'select_model',
            ),
        )
    }

    try {
        const oc = await getOpencode()
        const cwd = resolveRequestWorkingDir(c)
        const envelope = await compilePrompt(
            cwd,
            performer?.talRef || null,
            uniqueAssetRefs([...(performer?.danceRefs || []), ...(performer?.extraDanceRefs || [])]),
            performer?.model || null,
            performer?.drafts || {},
            performer?.modelVariant || null,
            performer?.danceDeliveryMode || 'auto',
        )
        const toolResolution = await resolveRuntimeTools(
            cwd,
            performer.model,
            performer?.mcpServerNames || [],
        )
        const unavailableSummary = describeUnavailableRuntimeTools(toolResolution)
        if (toolResolution.selectedMcpServers.length > 0 && toolResolution.resolvedTools.length === 0 && unavailableSummary) {
            throw new StudioValidationError(
                `Selected MCP servers are unavailable: ${unavailableSummary}.`,
                'fix_input',
            )
        }

        const parts: any[] = [{ type: 'text', text: message }]
        if (attachments && attachments.length > 0) {
            if (envelope.capabilitySnapshot && !envelope.capabilitySnapshot.attachment) {
                return jsonOpencodeError(
                    c,
                    new StudioValidationError(
                        'Selected model does not support attachments. Remove the files or choose a model that supports them.',
                        'choose_model',
                    ),
                    { model: performer.model },
                )
            }
            for (const att of attachments) {
                parts.push({
                    type: 'file',
                    mime: att.mime,
                    url: att.url,
                    filename: att.filename,
                })
            }
        }

        const tools = buildEnabledToolMap([
            ...toolResolution.resolvedTools,
            ...(envelope.toolName ? [envelope.toolName] : []),
        ])

        unwrapOpencodeResult(await oc.session.promptAsync({
            sessionID: c.req.param('id'),
            directory: cwd,
            model: { providerID: performer.model.provider, modelID: performer.model.modelId },
            agent: performer.agentId || (performer.planMode ? 'plan' : 'build'),
            system: envelope.system,
            ...(performer.modelVariant ? { variant: performer.modelVariant } : {}),
            ...(tools ? { tools } : {}),
            parts,
        }))

        return c.json({ accepted: true }, 202)
    } catch (err) {
        return jsonOpencodeError(c, err, { model: performer.model })
    }
})

// ── Abort ───────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/abort', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = requestDirectoryQuery(c)
        unwrapOpencodeResult(await oc.session.abort({
            sessionID: c.req.param('id'),
            ...directoryQuery,
        }))
        await waitForSessionToSettle(oc, c.req.param('id'), directoryQuery).catch(() => {})
        return c.json({ ok: true })
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── SSE event stream ────────────────────────────────────
chat.get('/api/chat/events', async (c) => {
    try {
        const oc = await getOpencode()
        const events = await oc.event.subscribe(requestDirectoryQuery(c))

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const event of events.stream) {
                        const data = JSON.stringify(event)
                        controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
                    }
                } catch {
                    controller.close()
                }
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        })
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

// ── Messages ────────────────────────────────────────────
chat.get('/api/chat/sessions/:id/messages', async (c) => {
    try {
        const oc = await getOpencode()
        const directoryQuery = requestDirectoryQuery(c)
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
        const data = unwrapOpencodeResult<any[]>(await oc.session.diff({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
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
        const data = unwrapOpencodeResult<any[]>(await oc.session.todo({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
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
        const data = unwrapOpencodeResult<any>(await oc.session.fork({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
            messageID: messageId,
        }))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Share ───────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/share', async (c) => {
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.session.share({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
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
        const data = unwrapOpencodeResult<boolean>(await oc.session.summarize({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
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
        const data = unwrapOpencodeResult<any>(await oc.session.revert({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
            messageID: messageId,
            ...(partId ? { partID: partId } : {}),
        }))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Unrevert ────────────────────────────────────────────
chat.post('/api/chat/sessions/:id/unrevert', async (c) => {
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.session.unrevert({
            sessionID: c.req.param('id'),
            ...requestDirectoryQuery(c),
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
        const data = unwrapOpencodeResult<any[]>(await oc.session.list(requestDirectoryQuery(c)))
        return c.json(data || [])
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chat
