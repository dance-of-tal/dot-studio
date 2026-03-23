import { Hono } from 'hono'
import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import type { ChatSendRequest } from '../../shared/chat-contracts.js'
import { uniqueAssetRefs } from '../lib/chat-session.js'
import { resolveSessionExecutionContext } from '../lib/session-execution.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { sendStudioChatMessage } from '../services/chat-service.js'
import {
    listStudioSessionDiff,
    listStudioSessionMessages,
    rejectQuestion,
    respondQuestion,
} from '../services/chat-session-service.js'
import { requestWorkingDir } from './route-errors.js'

const chatMessages = new Hono()

chatMessages.post('/api/chat/sessions/:id/send', async (c) => {
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
        const workingDir = requestWorkingDir(c)
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

chatMessages.post('/api/chat/questions/:qid/respond', async (c) => {
    const { answers } = await c.req.json<{ answers: QuestionAnswer[] }>()
    try {
        return c.json(await respondQuestion(c.req.param('qid'), answers))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.post('/api/chat/questions/:qid/reject', async (c) => {
    try {
        return c.json(await rejectQuestion(c.req.param('qid')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.get('/api/chat/sessions/:id/messages', async (c) => {
    try {
        return c.json(await listStudioSessionMessages(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.get('/api/chat/sessions/:id/diff', async (c) => {
    try {
        return c.json(await listStudioSessionDiff(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chatMessages
