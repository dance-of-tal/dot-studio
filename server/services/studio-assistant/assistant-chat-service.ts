import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { StudioValidationError } from '../../lib/opencode-errors.js'
import type { AssistantStageContext } from '../../../shared/assistant-actions.js'
import { buildAssistantToolMap } from './assistant-tools.js'
import {
    buildAssistantActionPrompt,
    buildAssistantDiscoveryPrompt,
    ensureAssistantAgent,
} from './assistant-service.js'

function toCapabilitySnapshot(runtimeModel: Awaited<ReturnType<typeof resolveRuntimeModel>>) {
    if (!runtimeModel) {
        return null
    }

    return {
        toolCall: runtimeModel.toolCall,
        reasoning: runtimeModel.reasoning,
        attachment: runtimeModel.attachment,
        temperature: runtimeModel.temperature,
        modalities: runtimeModel.modalities,
    }
}

export async function prepareAssistantChatRequest(
    workingDir: string,
    options: {
        message: string
        model: { provider: string; modelId: string }
        assistantContext: AssistantStageContext | null
    },
) {
    const runtimeModel = await resolveRuntimeModel(workingDir, options.model)
    const capabilitySnapshot = toCapabilitySnapshot(runtimeModel)

    if (capabilitySnapshot && !capabilitySnapshot.toolCall) {
        throw new StudioValidationError(
            'Studio Assistant now requires a tool-capable model. Choose a model with tools enabled.',
            'choose_model',
        )
    }

    const [assistantAgentName, discoveryPrompt] = await Promise.all([
        ensureAssistantAgent(workingDir),
        buildAssistantDiscoveryPrompt(workingDir, options.message),
    ])

    return {
        assistantAgentName,
        capabilitySnapshot,
        promptTools: buildAssistantToolMap(),
        systemPrompt: [
            buildAssistantActionPrompt(options.assistantContext),
            discoveryPrompt,
        ].filter(Boolean).join('\n\n'),
    }
}
