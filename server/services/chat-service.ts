import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { describeUnavailableRuntimeTools, resolveRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { getSafeOwnerExecutionDir } from '../lib/safe-mode.js'
import { registerSessionExecutionContext } from '../lib/session-execution.js'
import {
    ensureProjection,
    getProjectedAgentName,
    type PerformerProjectionInput,
} from './opencode-projection/stage-projection-service.js'

export async function createStudioChatSession(
    cwd: string,
    request: ChatSessionCreateRequest,
) {
    const oc = await getOpencode()
    const executionDir = await getSafeOwnerExecutionDir(
        cwd,
        'performer',
        request.performerId,
        request.executionMode || 'direct',
    )
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: executionDir,
        title: buildStudioSessionTitle(request.performerId, request.performerName, request.configHash),
    }))
    await registerSessionExecutionContext({
        sessionId: session.id,
        ownerKind: 'performer',
        ownerId: request.performerId,
        mode: request.executionMode || 'direct',
        workingDir: cwd,
        executionDir,
    })
    return {
        sessionId: session.id,
        title: session.title,
    }
}

export async function sendStudioChatMessage(
    cwd: string,
    sessionId: string,
    request: ChatSendRequest,
) {
    const performer = request.performer
    if (!performer?.model) {
        throw new StudioValidationError(
            'Select a model for this performer before sending prompts.',
            'select_model',
        )
    }

    // Ensure projection is up-to-date
    const projectionInput: PerformerProjectionInput = {
        performerId: performer.performerId || 'default',
        talRef: performer.talRef || null,
        danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        description: performer.description,
    }
    await ensureProjection(cwd, cwd, [projectionInput], performer.drafts || {}, request.relations || [])

    // Resolve projected agent name
    const posture = (performer.planMode ? 'plan' : 'build') as 'build' | 'plan'
    const agentName = getProjectedAgentName(cwd, projectionInput.performerId, posture)

    // MCP tool resolution — UX-only validation (preemptive warning)
    const toolResolution = await resolveRuntimeTools(
        cwd,
        performer.model,
        performer.mcpServerNames || [],
    )
    const unavailableSummary = describeUnavailableRuntimeTools(toolResolution)
    if (toolResolution.selectedMcpServers.length > 0 && toolResolution.resolvedTools.length === 0 && unavailableSummary) {
        throw new StudioValidationError(
            `Selected MCP servers are unavailable: ${unavailableSummary}.`,
            'fix_input',
        )
    }

    // Build message parts
    const parts: any[] = [{ type: 'text', text: request.message }]
    if (request.attachments && request.attachments.length > 0) {
        for (const attachment of request.attachments) {
            parts.push({
                type: 'file',
                mime: attachment.mime,
                url: attachment.url,
                filename: attachment.filename,
            })
        }
    }

    // PRD §9.1: compiled agent name만 전달. system/model/tools inline override 제거.
    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.session.promptAsync({
        sessionID: sessionId,
        directory: cwd,
        agent: agentName,
        parts,
    }))

    return { accepted: true as const }
}
