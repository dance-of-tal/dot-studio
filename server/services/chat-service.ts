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
    const ownerKind = request.actId ? 'act' as const : 'performer' as const
    const ownerId = request.actId ?? request.performerId
    const executionDir = await getSafeOwnerExecutionDir(
        cwd,
        ownerKind,
        ownerId,
        request.executionMode || 'direct',
    )
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: executionDir,
        title: buildStudioSessionTitle(request.performerId, request.performerName, request.configHash),
    }))
    await registerSessionExecutionContext({
        sessionId: session.id,
        ownerKind,
        ownerId,
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
        ...(request.actId ? { scope: 'act' as const, actId: request.actId } : {}),
    })

    for (const related of request.relatedPerformers || []) {
        if (!related.model) {
            continue
        }
        // Pass B's own outgoing edges as requestTargets so B's agent .md
        // gets task-allowlist entries (enabling A→B→C chaining).
        const nestedTargets = (related.relatedPerformerIds || []).map((target) => ({
            performerId: target.performerId,
            performerName: target.performerName,
            description: target.description || '',
        }))
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
            requestTargets: nestedTargets.length > 0 ? nestedTargets : undefined,
            ...(request.actId ? { scope: 'act' as const, actId: request.actId } : {}),
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
