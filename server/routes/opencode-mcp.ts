import { Hono } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    authenticateMcp,
    completeMcpAuth,
    connectMcpServer,
    getStudioMcpCatalog,
    listMcpServers,
    removeMcpAuth,
    startMcpAuth,
    updateStudioMcpCatalog,
} from '../services/opencode-service.js'
import { requestWorkingDir } from './route-errors.js'

const opencodeMcp = new Hono()

opencodeMcp.get('/api/mcp/catalog', async (c) => {
    try {
        return c.json(await getStudioMcpCatalog())
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.put('/api/mcp/catalog', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
        return c.json(await updateStudioMcpCatalog(body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.get('/api/mcp/servers', async (c) => {
    try {
        const cwd = requestWorkingDir(c)
        if (c.req.query('refresh') === '1') {
            return c.json(await listMcpServers(cwd))
        }
        return c.json(await cached(`mcp-servers-${cwd}`, TTL.MCP_SERVERS, async () => listMcpServers(cwd)))
    } catch {
        return c.json([])
    }
})

opencodeMcp.post('/api/mcp/:name/connect', async (c) => {
    try {
        return c.json(await connectMcpServer(requestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.post('/api/mcp/:name/auth/start', async (c) => {
    try {
        return c.json(await startMcpAuth(requestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/callback', async (c) => {
    const { code } = await c.req.json<{ code: string }>().catch(() => ({ code: '' }))
    try {
        return c.json(await completeMcpAuth(requestWorkingDir(c), c.req.param('name'), code))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/authenticate', async (c) => {
    try {
        return c.json(await authenticateMcp(requestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.delete('/api/mcp/:name/auth', async (c) => {
    try {
        return c.json(await removeMcpAuth(requestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

export default opencodeMcp
