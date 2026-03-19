import { Hono } from 'hono'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import { createSSEResponse } from '../lib/sse.js'
import { buildStudioChatEventStream } from '../services/chat-event-stream-service.js'
import { requestWorkingDir } from './route-errors.js'

const chatStream = new Hono()

chatStream.get('/api/chat/events', async (c) => {
    try {
        return createSSEResponse(await buildStudioChatEventStream(requestWorkingDir(c), c.req.raw.signal))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

export default chatStream
