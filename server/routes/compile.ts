import { Hono } from 'hono'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import { compileProjectionPreview } from '../services/opencode-projection/preview-service.js'

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
        return c.json(await compileProjectionPreview(cwd, body))
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

export default compile
