import { Hono } from 'hono'
import type { ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { createStudioChatSession } from '../services/chat-service.js'
import {
    abortStudioChatSession,
    deleteStudioChatSession,
    getStudioChatSessionStatus,
    listStudioChatSessions,
    renameStudioChatSession,
    respondSessionPermission,
    revertStudioChatSession,
    shareStudioChatSession,
    summarizeStudioChatSession,
    unrevertStudioChatSession,
    listPendingPermissions,
} from '../services/chat-session-service.js'
import { requestWorkingDir } from './route-errors.js'

const chatSessions = new Hono()

chatSessions.post('/api/chat/sessions', async (c) => {
    const body = await c.req.json<ChatSessionCreateRequest>()
    try {
        return c.json(await createStudioChatSession(requestWorkingDir(c), body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/sessions', async (c) => {
    try {
        return c.json(await listStudioChatSessions(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/sessions/:id/status', async (c) => {
    try {
        return c.json(await getStudioChatSessionStatus(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.delete('/api/chat/sessions/:id', async (c) => {
    try {
        return c.json(await deleteStudioChatSession(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.put('/api/chat/sessions/:id', async (c) => {
    const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))
    const title = body.title
    if (!title || !title.trim()) {
        return jsonOpencodeError(
            c,
            new StudioValidationError('Thread title is required.', 'fix_input'),
        )
    }

    try {
        return c.json(await renameStudioChatSession(requestWorkingDir(c), c.req.param('id'), title.trim()))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/abort', async (c) => {
    try {
        return c.json(await abortStudioChatSession(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/permission/:pid/respond', async (c) => {
    const { response } = await c.req.json<{ response: 'once' | 'always' | 'reject' }>()
    try {
        return c.json(await respondSessionPermission(requestWorkingDir(c), c.req.param('id'), c.req.param('pid'), response))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/share', async (c) => {
    try {
        return c.json(await shareStudioChatSession(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/summarize', async (c) => {
    const { providerID, modelID, auto } = await c.req.json<{
        providerID?: string
        modelID?: string
        auto?: boolean
    }>()
    try {
        return c.json(await summarizeStudioChatSession(requestWorkingDir(c), c.req.param('id'), { providerID, modelID, auto }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/revert', async (c) => {
    const { messageId, partId } = await c.req.json<{ messageId: string; partId?: string }>()
    try {
        return c.json(await revertStudioChatSession(requestWorkingDir(c), c.req.param('id'), { messageId, partId }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/unrevert', async (c) => {
    try {
        return c.json(await unrevertStudioChatSession(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/permissions', async (c) => {
    try {
        return c.json(await listPendingPermissions(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chatSessions
