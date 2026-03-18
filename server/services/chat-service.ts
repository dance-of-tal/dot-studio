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

    // Extract raw performer key for Act-namespaced chatKeys
    const rawPerformerId = request.actId && performer.performerId.startsWith('act:')
        ? performer.performerId.split(':').slice(2).join(':')
        : performer.performerId

    // Note: In the choreography model, inter-performer communication is handled
    // by the mailbox event router (Phase 2), not by custom tool projection here.
    // This function now only handles single-performer chat projection.

    // ── Studio Assistant — agent projected at stage-save / activate time.
    //    Fallback: re-ensure here in case files were deleted or never created.
    const isAssistant = rawPerformerId === 'studio-assistant'
    let ensured: Awaited<ReturnType<typeof ensurePerformerProjection>>

    if (isAssistant) {
        const { ensureAssistantAgent } = await import('./studio-assistant/assistant-service.js')
        const agentName = await ensureAssistantAgent(executionDir)

        // Build a minimal "ensured" result compatible with the rest of the function
        ensured = {
            compiled: {
                agentNames: { build: agentName, plan: agentName },
                agentPaths: { build: '', plan: '' },
                agentContents: { build: '', plan: '' },
                allFiles: [],
            } as any,
            toolResolution: {
                selectedMcpServers: [],
                resolvedTools: [],
                unavailableTools: [],
            } as any,
            capabilitySnapshot: null as any,
        }
    } else {
        ensured = await ensurePerformerProjection({
            performerId: rawPerformerId,
            performerName: performer.performerName,
            talRef: performer.talRef,
            danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
            model: performer.model,
            modelVariant: performer.modelVariant || null,
            mcpServerNames: performer.mcpServerNames || [],
            executionDir,
            workingDir,
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
        // Pass model directly so OpenCode uses the user's selected model,
        // not the (potentially stale) model cached from the agent file.
        model: performer.model ? {
            providerID: performer.model.provider,
            modelID: performer.model.modelId,
        } : undefined,
        parts,
    }))

    return { accepted: true as const }
}
