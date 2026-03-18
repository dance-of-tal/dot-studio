import type { CompilePromptRequest } from '../../../shared/chat-contracts.js'
import { ensurePerformerProjection } from './stage-projection-service.js'

export async function compileProjectionPreview(
    cwd: string,
    request: CompilePromptRequest,
) {
    const posture = request.planMode ? 'plan' : 'build'
    const ensured = await ensurePerformerProjection({
        performerId: request.performerId || 'preview',
        performerName: request.performerName || 'Preview',
        talRef: request.talRef,
        danceRefs: request.danceRefs,
        model: request.model,
        modelVariant: request.modelVariant || null,
        mcpServerNames: request.mcpServerNames || [],
        executionDir: cwd,
        workingDir: cwd,
        requestTargets: request.relatedPerformers || [],
    })

    return {
        system: ensured.compiled.agentContents[posture],
        agent: ensured.compiled.agentNames[posture],
        danceCatalog: ensured.compiled.skills.map((skill) => ({
            urn: skill.logicalName,
            description: skill.description,
            loadMode: 'tool' as const,
        })),
        deliveryMode: 'tool' as const,
        capabilitySnapshot: ensured.capabilitySnapshot,
        toolResolution: ensured.toolResolution,
    }
}
