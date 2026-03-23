// Workspace CRUD Routes — with path validation

import { Hono } from 'hono'
import {
    deleteSavedWorkspace,
    getSavedWorkspace,
    listSavedWorkspaces,
    saveWorkspaceSnapshot,
    setSavedWorkspaceHidden,
} from '../services/workspace-service.js'
import { jsonServiceFailure } from './route-errors.js'

const workspaces = new Hono()

function registerWorkspaceRoutes(basePath: '/api/workspaces' | '/api/stages') {
    workspaces.get(basePath, async (c) => {
        try {
            return c.json(await listSavedWorkspaces(c.req.query('includeHidden') === '1'))
        } catch {
            return c.json([])
        }
    })

    workspaces.get(`${basePath}/:id`, async (c) => {
        const result = await getSavedWorkspace(c.req.param('id'))
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result.workspace)
    })

    workspaces.put(basePath, async (c) => {
        const body = await c.req.json()
        const result = await saveWorkspaceSnapshot(body)
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })

    workspaces.patch(`${basePath}/:id`, async (c) => {
        const body = await c.req.json<{ hiddenFromList?: boolean }>().catch((): { hiddenFromList?: boolean } => ({}))
        const result = await setSavedWorkspaceHidden(c.req.param('id'), body.hiddenFromList === true)
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })

    workspaces.delete(`${basePath}/:id`, async (c) => {
        const result = await deleteSavedWorkspace(c.req.param('id'))
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })
}

registerWorkspaceRoutes('/api/workspaces')
registerWorkspaceRoutes('/api/stages')

export default workspaces
