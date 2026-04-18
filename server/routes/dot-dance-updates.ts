import { Hono } from 'hono'
import type {
    DotDanceReimportSourceRequest,
    DotDanceUpdateApplyRequest,
    DotDanceUpdateCheckRequest,
} from '../../shared/dot-contracts.js'
import {
    applyDanceGitHubUpdates,
    checkDanceGitHubUpdates,
    reimportDanceGitHubSource,
} from '../services/dance-github-update-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotDanceUpdates = new Hono()

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

dotDanceUpdates.post('/api/dot/dance-updates/check', async (c) => {
    const body = await c.req.json<DotDanceUpdateCheckRequest>().catch(() => null)
    if (!body?.assets?.length) {
        return jsonError(c, 'At least one installed Dance asset is required.', 400)
    }

    try {
        return c.json({
            results: await checkDanceGitHubUpdates(requestWorkingDir(c), body.assets, body.includeRepoDrift === true),
        })
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to check GitHub Dance updates.'), 500)
    }
})

dotDanceUpdates.post('/api/dot/dance-updates/apply', async (c) => {
    const body = await c.req.json<DotDanceUpdateApplyRequest>().catch(() => null)
    if (!body?.assets?.length) {
        return jsonError(c, 'At least one installed Dance asset is required.', 400)
    }

    try {
        return c.json(await applyDanceGitHubUpdates(requestWorkingDir(c), body.assets))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to update GitHub Dance assets.'), 500)
    }
})

dotDanceUpdates.post('/api/dot/dance-updates/reimport-source', async (c) => {
    const body = await c.req.json<DotDanceReimportSourceRequest>().catch(() => null)
    if (!body?.urn || !body.scope) {
        return jsonError(c, 'Installed Dance urn and scope are required.', 400)
    }

    try {
        return c.json(await reimportDanceGitHubSource(requestWorkingDir(c), body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to import newly available GitHub Dance skills.'), 500)
    }
})

export default dotDanceUpdates
