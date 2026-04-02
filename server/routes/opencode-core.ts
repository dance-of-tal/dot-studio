import { Hono } from 'hono'
import type { ModelSelection } from '../../shared/model-types.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import { listRuntimeModels, listProviderSummaries } from '../lib/model-catalog.js'
import {
    getLspStatus,
    getGlobalOpenCodeConfig,
    getOpenCodeHealth,
    getOpenCodeUnavailableHealth,
    getProviderAuthStatus,
    getVcsStatus,
    listOpenCodeAgents,
    listOpenCodeToolIds,
    listOpenCodeToolsForModel,
    readProjectConfigSnapshot,
    restartManagedOpenCode,
    updateGlobalOpenCodeConfig,
    updateProjectOpenCodeConfig,
} from '../services/opencode-service.js'
import { applyStudioRuntimeReload } from '../services/runtime-reload-service.js'
import { requestWorkingDir } from './route-errors.js'

const opencodeCore = new Hono()

function toError(error: unknown) {
    return error instanceof Error ? error : new Error('OpenCode is unavailable')
}

opencodeCore.get('/api/opencode/health', async (c) => {
    try {
        return c.json(await getOpenCodeHealth(requestWorkingDir(c)))
    } catch (error: unknown) {
        return c.json(getOpenCodeUnavailableHealth(toError(error)), 503)
    }
})

opencodeCore.post('/api/opencode/restart', async (c) => {
    try {
        return c.json(await restartManagedOpenCode())
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 400 })
    }
})

opencodeCore.post('/api/opencode/runtime/apply', async (c) => {
    try {
        return c.json(await applyStudioRuntimeReload(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/models', async (c) => {
    try {
        return c.json(await listRuntimeModels(requestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencodeCore.get('/api/providers', async (c) => {
    try {
        return c.json(await listProviderSummaries(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencodeCore.get('/api/agents', async (c) => {
    try {
        return c.json(await listOpenCodeAgents(requestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencodeCore.get('/api/tools', async (c) => {
    try {
        return c.json(await listOpenCodeToolIds(requestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencodeCore.get('/api/tools/:provider/:model', async (c) => {
    try {
        return c.json(await listOpenCodeToolsForModel(
            requestWorkingDir(c),
            c.req.param('provider'),
            c.req.param('model'),
        ))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.post('/api/runtime/tools', async (c) => {
    const { model = null, mcpServerNames = [] } = await c.req.json<{
        model?: ModelSelection
        mcpServerNames?: string[]
    }>()
    try {
        return c.json(await resolveRuntimeTools(
            requestWorkingDir(c),
            model,
            mcpServerNames,
        ))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/config', async (c) => {
    try {
        return c.json(await getGlobalOpenCodeConfig())
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/config/project', async (c) => {
    return c.json(await readProjectConfigSnapshot(requestWorkingDir(c)))
})

opencodeCore.put('/api/config', async (c) => {
    const body = await c.req.json()
    try {
        return c.json(await updateGlobalOpenCodeConfig(body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.put('/api/config/project', async (c) => {
    const body = await c.req.json()
    try {
        return c.json(await updateProjectOpenCodeConfig(requestWorkingDir(c), body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/provider/auth', async (c) => {
    try {
        return c.json(await getProviderAuthStatus(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencodeCore.get('/api/lsp/status', async (c) => {
    try {
        return c.json(await getLspStatus(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/vcs', async (c) => {
    try {
        return c.json(await getVcsStatus(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeCore
