import { Hono } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    addMcpServer,
    authenticateMcp,
    completeMcpAuth,
    connectMcpServer,
    disconnectMcpServer,
    listMcpServers,
    removeMcpAuth,
    startMcpAuth,
} from '../services/opencode-service.js'

const opencodeMcp = new Hono()

opencodeMcp.get('/api/mcp/servers', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await cached(`mcp-servers-${cwd}`, TTL.MCP_SERVERS, async () => listMcpServers(cwd)))
    } catch {
        return c.json([])
    }
})

opencodeMcp.post('/api/mcp/add', async (c) => {
    const { name, config } = await c.req.json<{
        name: string
        config: { command: string; args?: string[]; env?: Record<string, string> } | { url: string }
    }>()
    try {
        return c.json(await addMcpServer(resolveRequestWorkingDir(c), { name, config }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.post('/api/mcp/:name/connect', async (c) => {
    try {
        return c.json(await connectMcpServer(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.post('/api/mcp/:name/auth/start', async (c) => {
    try {
        return c.json(await startMcpAuth(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/callback', async (c) => {
    const { code } = await c.req.json<{ code: string }>().catch(() => ({ code: '' }))
    try {
        return c.json(await completeMcpAuth(resolveRequestWorkingDir(c), c.req.param('name'), code))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/authenticate', async (c) => {
    try {
        return c.json(await authenticateMcp(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.delete('/api/mcp/:name/auth', async (c) => {
    try {
        return c.json(await removeMcpAuth(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/disconnect', async (c) => {
    try {
        return c.json(await disconnectMcpServer(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeMcp
