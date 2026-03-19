import { Hono } from 'hono'
import chatSessions from './chat-sessions.js'
import chatMessages from './chat-messages.js'
import chatStream from './chat-stream.js'

const chat = new Hono()

chat.route('/', chatSessions)
chat.route('/', chatMessages)
chat.route('/', chatStream)

export default chat
