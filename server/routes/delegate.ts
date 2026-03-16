/**
 * delegate.ts — POST /api/act/delegate route
 *
 * Called by generated custom tools in .opencode/tools/.
 * Routes delegation requests to delegate-service.ts.
 */

import { Hono } from 'hono'
import { delegateToPerformer, type DelegateRequest } from '../services/delegate-service.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

const delegate = new Hono()

delegate.post('/api/act/delegate', async (c) => {
    try {
        const body = await c.req.json<{
            actId: string
            relationId: string
            callerSessionId: string
            prompt: string
            targetAgentName: string
            description?: string
            awaitResult?: boolean
            sessionPolicy?: 'fresh' | 'reuse'
            maxCalls?: number
            timeout?: number
        }>()

        if (!body.actId || !body.relationId || !body.prompt || !body.targetAgentName) {
            return c.json({
                ok: false,
                error: 'Missing required fields: actId, relationId, prompt, targetAgentName',
            }, 400)
        }

        const workingDir = resolveRequestWorkingDir(c)

        const request: DelegateRequest = {
            actId: body.actId,
            relationId: body.relationId,
            callerSessionId: body.callerSessionId || '',
            prompt: body.prompt,
            targetAgentName: body.targetAgentName,
            description: body.description || '',
            awaitResult: body.awaitResult ?? true,
            sessionPolicy: body.sessionPolicy || 'fresh',
            maxCalls: body.maxCalls ?? 10,
            timeout: body.timeout ?? 300,
        }

        const result = await delegateToPerformer(workingDir, request)
        return c.json(result)
    } catch (err) {
        console.error('[delegate route] error:', err)
        return c.json({
            ok: false,
            error: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
        }, 500)
    }
})

export default delegate
