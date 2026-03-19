import { Hono } from 'hono'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { compileStudioPromptPreview } from '../services/compile-service.js'

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
        return c.json(await compileStudioPromptPreview(resolveRequestWorkingDir(c), body))
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

export default compile
