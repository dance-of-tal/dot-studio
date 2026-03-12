// OpenCode SDK Proxy Routes
// Models, Agents, Tools, Config, Provider Auth, File, Find, VCS, LSP, MCP

import { Hono } from 'hono'
import { getOpencode } from '../lib/opencode.js'
import { cached, invalidate, TTL } from '../lib/cache.js'
import type { ModelSelection } from '../lib/prompt.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import { requestDirectoryQuery, resolveRequestWorkingDir } from '../lib/request-context.js'
import { restartOpencodeSidecar, isManagedOpencode } from '../lib/opencode-sidecar.js'
import { OPENCODE_URL } from '../lib/config.js'
import { clearStoredProviderAuth } from '../lib/opencode-auth.js'
import { jsonOpencodeError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { listRuntimeModels } from '../lib/model-catalog.js'
import { readProjectConfigFile, readProjectMcpCatalog, summarizeProjectMcpCatalog } from '../lib/project-config.js'
import {
    opencodeModeMeta,
    responseData,
    readProjectConfigFromOpencode,
    mergeProjectConfig,
    runMcpMutation,
    validateMcpAuthRequest,
} from '../services/opencode-service.js'

const opencode = new Hono()



// ── OpenCode Health ─────────────────────────────────────
opencode.get('/api/opencode/health', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.project.current(requestDirectoryQuery(c))
        const data = responseData(res, null)
        return c.json({
            connected: true,
            url: OPENCODE_URL,
            project: data,
            ...opencodeModeMeta(),
        })
    } catch (err: any) {
        return c.json({
            connected: false,
            error: err.message,
            url: OPENCODE_URL,
            ...opencodeModeMeta(),
        }, 503)
    }
})

opencode.post('/api/opencode/restart', async (c) => {
    try {
        await restartOpencodeSidecar()
        return c.json({
            ok: true,
            managed: isManagedOpencode(),
            mode: isManagedOpencode() ? 'managed' : 'external',
        })
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
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.provider.list({ directory: cwd }))
        const connected = new Set<string>((data?.connected || []) as string[])

        const providers = ((data?.all || []) as any[]).map((provider) => ({
            id: provider.id,
            name: provider.name || provider.id,
            source: provider.source || 'builtin',
            env: Array.isArray(provider.env) ? provider.env : [],
            connected: connected.has(provider.id),
            modelCount: provider.models ? Object.keys(provider.models).length : 0,
            defaultModel: data?.default?.[provider.id] || null,
        }))

        return c.json(providers)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

// ── Agents ──────────────────────────────────────────────
opencode.get('/api/agents', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.app.agents(requestDirectoryQuery(c))
        return c.json(responseData(res, []))
    } catch {
        return c.json([])
    }
})

// ── Tools ───────────────────────────────────────────────
opencode.get('/api/tools', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.tool.ids(requestDirectoryQuery(c))
        return c.json(responseData(res, []))
    } catch {
        return c.json([])
    }
})

opencode.get('/api/tools/:provider/:model', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.tool.list({
            ...requestDirectoryQuery(c),
            provider: c.req.param('provider'),
            model: c.req.param('model'),
        })
        return c.json(responseData(res, []))
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
        const oc = await getOpencode()
        const res = await oc.config.get(requestDirectoryQuery(c))
        return c.json(responseData(res, {}))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/config/project', async (c) => {
    try {
        const { cwd, config } = await readProjectConfigFromOpencode(c)
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
        const oc = await getOpencode()
        const cwd = resolveRequestWorkingDir(c)
        const current = await readProjectConfigFile(cwd)
        const nextConfig = mergeProjectConfig(current, body && typeof body === 'object' ? body : {})
        const res = await oc.config.update({ ...requestDirectoryQuery(c), config: nextConfig })
        invalidate('mcp-servers')
        return c.json(responseData(res, {}))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── Provider Auth ───────────────────────────────────────
opencode.get('/api/provider/auth', async (c) => {
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.provider.auth(requestDirectoryQuery(c)))
        return c.json(data || {})
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencode.post('/api/provider/:id/oauth/authorize', async (c) => {
    const { method } = await c.req.json<{ method: number }>()
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.provider.oauth.authorize({
            providerID: c.req.param('id'),
            ...requestDirectoryQuery(c),
            method,
        }))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.post('/api/provider/:id/oauth/callback', async (c) => {
    const { method, code } = await c.req.json<{ method: number; code?: string }>()
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.provider.oauth.callback({
            providerID: c.req.param('id'),
            ...requestDirectoryQuery(c),
            method,
            ...(code ? { code } : {}),
        }))
        unwrapOpencodeResult(await oc.instance.dispose(requestDirectoryQuery(c)))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.put('/api/provider/:id/auth', async (c) => {
    const auth = await c.req.json()
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.auth.set({
            providerID: c.req.param('id'),
            auth,
        }))
        unwrapOpencodeResult(await oc.instance.dispose(requestDirectoryQuery(c)))
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencode.delete('/api/provider/:id/auth', async (c) => {
    try {
        const oc = await getOpencode()
        await clearStoredProviderAuth(c.req.param('id'))
        unwrapOpencodeResult(await oc.instance.dispose(requestDirectoryQuery(c)))
        return c.json({ ok: true })
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

// ── LSP ─────────────────────────────────────────────────
opencode.get('/api/lsp/status', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.lsp.status(requestDirectoryQuery(c))
        return c.json(responseData(res, []))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── MCP Servers ─────────────────────────────────────────
opencode.get('/api/mcp/servers', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await cached(`mcp-servers-${cwd}`, TTL.MCP_SERVERS, async () => {
            const oc = await getOpencode()
            const res = await oc.mcp.status({ directory: cwd })
            const data = ((res as any).data || {}) as Record<string, any>
            const catalog = await readProjectMcpCatalog(cwd)
            return summarizeProjectMcpCatalog(catalog, data)
        }))
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
        return await runMcpMutation(c, (oc) => oc.mcp.add({
            ...requestDirectoryQuery(c),
            name,
            config: config as any,
        }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.post('/api/mcp/:name/connect', async (c) => {
    try {
        return await runMcpMutation(c, (oc) => oc.mcp.connect({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.post('/api/mcp/:name/auth/start', async (c) => {
    try {
        await validateMcpAuthRequest(c, c.req.param('name'))
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.mcp.auth.start({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        }))
        invalidate('mcp-servers')
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/auth/callback', async (c) => {
    const { code } = await c.req.json<{ code: string }>().catch(() => ({ code: '' }))
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.mcp.auth.callback({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
            code,
        }))
        invalidate('mcp-servers')
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/auth/authenticate', async (c) => {
    try {
        await validateMcpAuthRequest(c, c.req.param('name'))
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.mcp.auth.authenticate({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        }))
        invalidate('mcp-servers')
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.delete('/api/mcp/:name/auth', async (c) => {
    try {
        const oc = await getOpencode()
        const data = unwrapOpencodeResult<any>(await oc.mcp.auth.remove({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        }))
        invalidate('mcp-servers')
        return c.json(data)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencode.post('/api/mcp/:name/disconnect', async (c) => {
    try {
        return await runMcpMutation(c, (oc) => oc.mcp.disconnect({
            name: c.req.param('name'),
            ...requestDirectoryQuery(c),
        }))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── File ────────────────────────────────────────────────
opencode.get('/api/file/list', async (c) => {
    const dirPath = c.req.query('path') || '.'
    try {
        const oc = await getOpencode()
        const res = await oc.file.list({ ...requestDirectoryQuery(c), path: dirPath })
        return c.json(responseData(res, []))
    } catch {
        return c.json([])
    }
})

opencode.get('/api/file/read', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path required' }, 400)
    try {
        const oc = await getOpencode()
        const res = await oc.file.read({ ...requestDirectoryQuery(c), path: filePath })
        return c.json(responseData(res, {}))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/file/status', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.file.status(requestDirectoryQuery(c))
        return c.json(responseData(res, []))
    } catch {
        return c.json([])
    }
})

// ── Find ────────────────────────────────────────────────
opencode.get('/api/find/text', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        const oc = await getOpencode()
        const res = await oc.find.text({ ...requestDirectoryQuery(c), pattern })
        return c.json(responseData(res, []))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/find/files', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        const oc = await getOpencode()
        const res = await oc.find.files({ ...requestDirectoryQuery(c), query: pattern })
        return c.json(responseData(res, []))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencode.get('/api/find/symbols', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        const oc = await getOpencode()
        const res = await oc.find.symbols({ ...requestDirectoryQuery(c), query: pattern })
        return c.json(responseData(res, []))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

// ── VCS / Git ───────────────────────────────────────────
opencode.get('/api/vcs', async (c) => {
    try {
        const oc = await getOpencode()
        const res = await oc.vcs.get(requestDirectoryQuery(c))
        return c.json(responseData(res, {}))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencode
