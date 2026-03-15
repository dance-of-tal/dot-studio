import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { describeUnavailableRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { getSafeOwnerExecutionDir } from '../lib/safe-mode.js'
import { registerSessionExecutionContext } from '../lib/session-execution.js'
import { ensurePerformerProjection } from './opencode-projection/stage-projection-service.js'

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
    executionDir: string,
    workingDir: string,
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

    const requestTargets = (request.relatedPerformers || []).map((related) => ({
        performerId: related.performerId,
        performerName: related.performerName,
        description: related.description || '',
    }))

    const ensured = await ensurePerformerProjection({
        performerId: performer.performerId,
        performerName: performer.performerName,
        talRef: performer.talRef,
        danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
        drafts: performer.drafts || {},
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        executionDir,
        workingDir,
        requestTargets,
    })

    for (const related of request.relatedPerformers || []) {
        if (!related.model) {
            continue
        }
        await ensurePerformerProjection({
            performerId: related.performerId,
            performerName: related.performerName,
            talRef: related.talRef,
            danceRefs: related.danceRefs,
            drafts: related.drafts || performer.drafts || {},
            model: related.model,
            modelVariant: related.modelVariant || null,
            mcpServerNames: related.mcpServerNames || [],
            executionDir,
            workingDir,
        })
    }

    const unavailableSummary = describeUnavailableRuntimeTools(ensured.toolResolution)
    if (ensured.toolResolution.selectedMcpServers.length > 0 && ensured.toolResolution.resolvedTools.length === 0 && unavailableSummary) {
        throw new StudioValidationError(
            `Selected MCP servers are unavailable: ${unavailableSummary}.`,
            'fix_input',
        )
    }

    const parts: any[] = [{ type: 'text', text: request.message }]
    if (request.attachments && request.attachments.length > 0) {
        if (ensured.capabilitySnapshot && !ensured.capabilitySnapshot.attachment) {
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

    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.session.promptAsync({
        sessionID: sessionId,
        directory: executionDir,
        agent: ensured.compiled.agentNames[performer.planMode ? 'plan' : 'build'],
        parts,
    }))

    return { accepted: true as const }
}
