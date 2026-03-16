import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import { createAssistantSession, sendAssistantMessage } from '../services/studio-assistant/assistant-service.js'

const assistant = new Hono()

assistant.post('/api/assistant/session', async (c) => {
    try {
        const workingDir = resolveRequestWorkingDir(c)
        const result = await createAssistantSession(workingDir)
        return c.json(result)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

assistant.post('/api/assistant/send', async (c) => {
    try {
        const workingDir = resolveRequestWorkingDir(c)
        const body = await c.req.json<{
            sessionId: string
            message: string
            canvasContext: any
            model?: any
        }>()
        
        const result = await sendAssistantMessage(
            workingDir,
            body.sessionId,
            body.message,
            body.canvasContext,
            body.model
        )
        return c.json(result, 202)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default assistant
