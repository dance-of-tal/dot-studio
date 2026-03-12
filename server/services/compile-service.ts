import { buildPromptEnvelope, type DanceDeliveryMode, type ModelSelection } from '../lib/prompt.js'
import { resolveRuntimeTools } from '../lib/runtime-tools.js'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'

export async function compileStudioPrompt(
    cwd: string,
    request: CompilePromptRequest,
) {
    const preview = await buildPromptEnvelope({
        cwd,
        talRef: request.talRef,
        danceRefs: request.danceRefs,
        drafts: request.drafts || {},
        model: request.model as ModelSelection,
        modelVariant: request.modelVariant || null,
        danceDeliveryMode: (request.danceDeliveryMode || 'auto') as DanceDeliveryMode,
    })

    const toolResolution = await resolveRuntimeTools(
        cwd,
        request.model as ModelSelection,
        request.mcpServerNames || [],
    )

    return {
        agent: request.agentId || (request.planMode ? 'plan' : 'build'),
        ...preview,
        toolResolution,
    }
}
