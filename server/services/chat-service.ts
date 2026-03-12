import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { compileStudioPrompt } from './compile-service.js'
import { buildEnabledToolMap, describeUnavailableRuntimeTools, resolveRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'

export async function createStudioChatSession(
    cwd: string,
    request: ChatSessionCreateRequest,
) {
    const oc = await getOpencode()
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: cwd,
        title: buildStudioSessionTitle(request.performerId, request.performerName, request.configHash),
    }))
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

    const preview = await compileStudioPrompt(cwd, {
        talRef: performer.talRef,
        danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
        drafts: performer.drafts,
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        agentId: performer.agentId || null,
        mcpServerNames: performer.mcpServerNames || [],
        planMode: performer.planMode || false,
        danceDeliveryMode: performer.danceDeliveryMode || 'auto',
    })

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

    const parts: any[] = [{ type: 'text', text: request.message }]
    if (request.attachments && request.attachments.length > 0) {
        if (preview.capabilitySnapshot && !preview.capabilitySnapshot.attachment) {
            throw new StudioValidationError(
                'Selected model does not support attachments. Remove the files or choose a model that supports them.',
                'choose_model',
            )
        }
        for (const attachment of request.attachments) {
            parts.push({
                type: 'file',
                mime: attachment.mime,
                url: attachment.url,
                filename: attachment.filename,
            })
        }
    }

    const tools = buildEnabledToolMap([
        ...toolResolution.resolvedTools,
        ...(preview.toolName ? [preview.toolName] : []),
    ])

    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.session.promptAsync({
        sessionID: sessionId,
        directory: cwd,
        model: { providerID: performer.model.provider, modelID: performer.model.modelId },
        agent: performer.agentId || (performer.planMode ? 'plan' : 'build'),
        system: preview.system,
        ...(performer.modelVariant ? { variant: performer.modelVariant } : {}),
        ...(tools ? { tools } : {}),
        parts,
    }))

    return { accepted: true as const }
}
