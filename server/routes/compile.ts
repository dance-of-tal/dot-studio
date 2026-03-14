import { Hono } from 'hono'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../lib/opencode-errors.js'
import {
    ensureProjection,
    getProjectedAgentName,
    getCompiledPerformer,
    type PerformerProjectionInput,
} from '../services/opencode-projection/stage-projection-service.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import fs from 'fs/promises'

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
        const performerId = 'preview'
        const projectionInput: PerformerProjectionInput = {
            performerId,
            talRef: body.talRef,
            danceRefs: body.danceRefs,
            model,
            modelVariant: body.modelVariant || null,
            mcpServerNames: body.mcpServerNames || [],
        }
        await ensureProjection(cwd, cwd, [projectionInput], body.drafts || {})

        const posture = body.planMode ? 'plan' : 'build'
        const agentName = getProjectedAgentName(cwd, performerId, posture as 'build' | 'plan')
        const compiled = getCompiledPerformer(performerId)

        let system = ''
        if (compiled?.agentPaths[posture as 'build' | 'plan']) {
            system = await fs.readFile(compiled.agentPaths[posture as 'build' | 'plan'], 'utf-8')
        }

        const toolResolution = await resolveRuntimeTools(
            cwd,
            model,
            body.mcpServerNames || [],
        )

        return c.json({
            agent: agentName,
            system,
            danceCatalog: compiled?.skills.map(s => ({
                urn: s.logicalName,
                description: s.logicalName,
                loadMode: 'tool' as const,
            })) || [],
            deliveryMode: 'tool',
            capabilitySnapshot: null,
            toolResolution,
        })
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

export default compile
