import { Hono } from 'hono'
import { buildPromptEnvelope, type DanceDeliveryMode, type ModelSelection } from '../lib/prompt.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { abortActRuntime, runActRuntime, subscribeActRuntimeEvents } from '../lib/act-runtime.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'

const compile = new Hono()

export async function compilePrompt(
    cwd: string,
    talRef: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null,
    danceRefs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
    model: ModelSelection,
    drafts: Record<string, { id: string; kind: 'tal' | 'dance' | 'performer' | 'act'; name: string; content: unknown; description?: string; derivedFrom?: string | null }> = {},
    modelVariant: string | null = null,
    danceDeliveryMode: DanceDeliveryMode = 'auto',
) {
    return buildPromptEnvelope({
        cwd,
        talRef,
        danceRefs,
        drafts,
        model,
        modelVariant,
        danceDeliveryMode,
    })
}

compile.post('/api/compile', async (c) => {
    const { talRef, danceRefs, drafts = {}, model, modelVariant = null, agentId = null, mcpServerNames = [], planMode = false, danceDeliveryMode = 'auto' } = await c.req.json<{
        talRef: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null
        danceRefs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>
        drafts?: Record<string, { id: string; kind: 'tal' | 'dance' | 'performer' | 'act'; name: string; content: unknown; description?: string; derivedFrom?: string | null }>
        model: ModelSelection
        modelVariant?: string | null
        agentId?: string | null
        mcpServerNames?: string[]
        planMode?: boolean
        danceDeliveryMode?: DanceDeliveryMode
    }>()

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
        const preview = await compilePrompt(
            cwd,
            talRef || null,
            danceRefs || [],
            model,
            drafts,
            modelVariant,
            danceDeliveryMode,
        )
        const toolResolution = await resolveRuntimeTools(
            cwd,
            model,
            mcpServerNames,
        )
        return c.json({
            agent: agentId || (planMode ? 'plan' : 'build'),
            ...preview,
            toolResolution,
        })
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

compile.post('/api/act/run', async (c) => {
    try {
        const body = await c.req.json<{
            actSessionId?: string
            actUrn?: string
            stageAct?: unknown
            performers?: unknown[]
            drafts?: Record<string, unknown>
            input: string
            maxIterations?: number
            resumeSummary?: unknown
        }>()

        const cwd = resolveRequestWorkingDir(c)
        const result = await runActRuntime({
            cwd,
            actSessionId: body.actSessionId,
            actUrn: body.actUrn,
            stageAct: body.stageAct as any,
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
                const encoder = new TextEncoder()
                const unsubscribe = subscribeActRuntimeEvents(actSessionId, (event) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
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

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        })
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

export default compile
