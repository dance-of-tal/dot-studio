// OpenCode SDK Proxy Routes
// Models, Agents, Tools, Config, Provider Auth, File, Find, VCS, LSP, MCP

import { Hono } from 'hono'
import { cached, invalidate, TTL } from '../lib/cache.js'

import type { ModelSelection } from '../../shared/model-types.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import { requestDirectoryQuery, resolveRequestWorkingDir } from '../lib/request-context.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import { listRuntimeModels, listProviderSummaries } from '../lib/model-catalog.js'
import {
    authenticateMcp,
    authorizeProviderOauth,
    completeMcpAuth,
    completeProviderOauth,
    deleteProviderAuth,
    findFilesInProject,
    findSymbolsInProject,
    findTextInProject,
    getFileStatus,
    getLspStatus,
    getOpenCodeHealth,
    getOpenCodeUnavailableHealth,
    getOpenCodeConfig,
    getProviderAuthStatus,
    getVcsStatus,
    listMcpServers,
    listFiles,
    listOpenCodeAgents,
    listOpenCodeToolIds,
    listOpenCodeToolsForModel,
    removeMcpAuth,
    restartManagedOpenCode,
    readFile,
    readProjectConfigFromOpencode,
    runMcpMutation,
    startMcpAuth,
    updateOpenCodeConfig,
    updateProviderAuth,
} from '../services/opencode-service.js'

const opencode = new Hono()



// ── OpenCode Health ─────────────────────────────────────
opencode.get('/api/opencode/health', async (c) => {
    try {
        return c.json(await getOpenCodeHealth(resolveRequestWorkingDir(c)))
    } catch (err: any) {
        return c.json(getOpenCodeUnavailableHealth(err), 503)
    }
})

opencode.post('/api/opencode/restart', async (c) => {
    try {
        return c.json(await restartManagedOpenCode())
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 400 })
    }
})

// ── Models ──────────────────────────────────────────────
opencode.get('/api/models', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await listRuntimeModels(cwd))
    } catch {
        return c.json([])
    }
})

opencode.get('/api/providers', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await listProviderSummaries(cwd))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

// ── Agents ──────────────────────────────────────────────
opencode.get('/api/agents', async (c) => {
    try {
        return c.json(await listOpenCodeAgents(resolveRequestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

// ── Tools ───────────────────────────────────────────────
opencode.get('/api/tools', async (c) => {
    try {
        return c.json(await listOpenCodeToolIds(resolveRequestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencode.get('/api/tools/:provider/:model', async (c) => {
    try {
        return c.json(await listOpenCodeToolsForModel(resolveRequestWorkingDir(c), c.req.param('provider'), c.req.param('model')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.post('/api/runtime/tools', async (c) => {
    const { model = null, mcpServerNames = [] } = await c.req.json<{
        model?: ModelSelection
        mcpServerNames?: string[]
    }>()
    try {
        const resolution = await resolveRuntimeTools(
            resolveRequestWorkingDir(c),
            model,
            mcpServerNames,
        )
        return c.json(resolution)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Config ──────────────────────────────────────────────
opencode.get('/api/config', async (c) => {
    try {
        return c.json(await getOpenCodeConfig(resolveRequestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/config/project', async (c) => {
    try {
        const { cwd, config } = await readProjectConfigFromOpencode(resolveRequestWorkingDir(c))
        return c.json({
            exists: true,
            path: `${cwd}/config.json`,
            config,
        })
    } catch {
        const cwd = resolveRequestWorkingDir(c)
        return c.json({
            exists: false,
            path: `${cwd}/config.json`,
            config: {},
        })
    }
})

opencode.put('/api/config', async (c) => {
    const body = await c.req.json()
    try {
        return c.json(await updateOpenCodeConfig(resolveRequestWorkingDir(c), body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Provider Auth ───────────────────────────────────────
opencode.get('/api/provider/auth', async (c) => {
    try {
        return c.json(await getProviderAuthStatus(resolveRequestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencode.post('/api/provider/:id/oauth/authorize', async (c) => {
    const { method } = await c.req.json<{ method: number }>()
    try {
        return c.json(await authorizeProviderOauth(resolveRequestWorkingDir(c), c.req.param('id'), method))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.post('/api/provider/:id/oauth/callback', async (c) => {
    const { method, code } = await c.req.json<{ method: number; code?: string }>()
    try {
        return c.json(await completeProviderOauth(resolveRequestWorkingDir(c), c.req.param('id'), method, code))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.put('/api/provider/:id/auth', async (c) => {
    const auth = await c.req.json()
    try {
        return c.json(await updateProviderAuth(c.req.param('id'), auth))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.delete('/api/provider/:id/auth', async (c) => {
    try {
        return c.json(await deleteProviderAuth(c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

// ── LSP ─────────────────────────────────────────────────
opencode.get('/api/lsp/status', async (c) => {
    try {
        return c.json(await getLspStatus(resolveRequestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── MCP Servers ─────────────────────────────────────────
opencode.get('/api/mcp/servers', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await cached(`mcp-servers-${cwd}`, TTL.MCP_SERVERS, async () => listMcpServers(cwd)))
    } catch {
        return c.json([])
    }
})

opencode.post('/api/mcp/add', async (c) => {
    const { name, config } = await c.req.json<{
        name: string
        config: { command: string; args?: string[]; env?: Record<string, string> } | { url: string }
    }>()
    try {
        return c.json(await runMcpMutation(resolveRequestWorkingDir(c), (oc) => oc.mcp.add({
            ...requestDirectoryQuery(c),
            name,
            config: config as any,
        })))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.post('/api/mcp/:name/connect', async (c) => {
    try {
        return c.json(await runMcpMutation(resolveRequestWorkingDir(c), (oc) => oc.mcp.connect({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        })))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.post('/api/mcp/:name/auth/start', async (c) => {
    try {
        return c.json(await startMcpAuth(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/auth/callback', async (c) => {
    const { code } = await c.req.json<{ code: string }>().catch(() => ({ code: '' }))
    try {
        return c.json(await completeMcpAuth(resolveRequestWorkingDir(c), c.req.param('name'), code))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/auth/authenticate', async (c) => {
    try {
        return c.json(await authenticateMcp(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.delete('/api/mcp/:name/auth', async (c) => {
    try {
        return c.json(await removeMcpAuth(resolveRequestWorkingDir(c), c.req.param('name')))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/disconnect', async (c) => {
    try {
        return c.json(await runMcpMutation(resolveRequestWorkingDir(c), (oc) => oc.mcp.disconnect({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        })))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── File ────────────────────────────────────────────────
opencode.get('/api/file/list', async (c) => {
    const dirPath = c.req.query('path') || '.'
    try {
        return c.json(await listFiles(resolveRequestWorkingDir(c), dirPath))
    } catch {
        return c.json([])
    }
})

opencode.get('/api/file/read', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path required' }, 400)
    try {
        return c.json(await readFile(resolveRequestWorkingDir(c), filePath))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/file/status', async (c) => {
    try {
        return c.json(await getFileStatus(resolveRequestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

// ── Find ────────────────────────────────────────────────
opencode.get('/api/find/text', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findTextInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/find/files', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findFilesInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/find/symbols', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findSymbolsInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── VCS / Git ───────────────────────────────────────────
opencode.get('/api/vcs', async (c) => {
    try {
        return c.json(await getVcsStatus(resolveRequestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencode
