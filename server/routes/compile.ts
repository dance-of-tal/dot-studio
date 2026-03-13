import { Hono } from 'hono'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import type { RunActRequest } from '../../shared/act-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { runActRuntime } from '../lib/act-runtime.js'
import { abortActRuntime, subscribeActRuntimeEvents } from '../lib/act-runtime-events.js'
import { getSafeOwnerExecutionDir } from '../lib/safe-mode.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { compileStudioPrompt } from '../services/compile-service.js'
import { createSSEResponse, sseEncode } from '../lib/sse.js'

const compile = new Hono()

compile.post('/api/compile', async (c) => {
    const body = await c.req.json<CompilePromptRequest>()
    const { model } = body

    if (!model) {
        return jsonOpencodeError(
            c,
            new StudioValidationError(
                'Select a model for this performer before compiling prompts.',
                'select_model',
            ),
        )
    }

    try {
        const cwd = resolveRequestWorkingDir(c)
        return c.json(await compileStudioPrompt(cwd, body))
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

compile.post('/api/act/run', async (c) => {
    try {
        const body = await c.req.json<RunActRequest>()

        const workingDir = resolveRequestWorkingDir(c)
        const stageAct = body.stageAct as any
        const executionMode = stageAct?.executionMode === 'safe' ? 'safe' : 'direct'
        const cwd = stageAct?.id
            ? await getSafeOwnerExecutionDir(workingDir, 'act', stageAct.id, executionMode)
            : workingDir
        const result = await runActRuntime({
            cwd,
            baseWorkingDir: workingDir,
            executionMode,
            actSessionId: body.actSessionId,
            actUrn: body.actUrn,
            stageAct,
            performers: body.performers as any,
            drafts: body.drafts as any,
            input: body.input,
            maxIterations: body.maxIterations,
            resumeSummary: body.resumeSummary as any,
        })

        return c.json(result)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

compile.post('/api/act/sessions/:id/abort', async (c) => {
    try {
        const cwd = resolveRequestWorkingDir(c)
        await abortActRuntime(c.req.param('id'), cwd)
        return c.json({ ok: true })
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

compile.get('/api/act/events', async (c) => {
    try {
        const actSessionId = c.req.query('actSessionId')?.trim()
        if (!actSessionId) {
            return c.json({ error: 'actSessionId is required.' }, 400)
        }

        const stream = new ReadableStream({
            start(controller) {
                const unsubscribe = subscribeActRuntimeEvents(actSessionId, (event: unknown) => {
                    controller.enqueue(sseEncode(JSON.stringify(event)))
                })

                const close = () => {
                    unsubscribe()
                    try {
                        controller.close()
                    } catch {
                        // Stream may already be closed.
                    }
                }

                c.req.raw.signal?.addEventListener('abort', close, { once: true })
            },
        })

        return createSSEResponse(stream)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

export default compile
