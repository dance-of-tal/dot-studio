import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { describeUnavailableRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { getSafeOwnerExecutionDir } from '../lib/safe-mode.js'
import { registerSessionExecutionContext } from '../lib/session-execution.js'
import { ensurePerformerProjection } from './opencode-projection/stage-projection-service.js'
import { projectActTools, writeActToolFiles } from './act-runtime/act-tool-projection.js'
import { getActDefinitionForThread } from './act-runtime/act-runtime-service.js'

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
        title: buildStudioSessionTitle(request.performerId, request.performerName, request.configHash, request.executionMode),
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

    // ── Act tool projection ─────────────────────────────
    // When running in Act context with a thread, project Act runtime tools
    // (send_message, post_to_board, read_board, set_wake_condition) into the session.
    let actExtraTools: Array<{ name: string; content: string }> = []
    let actContextPrefix = ''

    if (request.actId && request.actThreadId) {
        try {
            const actDef = getActDefinitionForThread(workingDir, request.actThreadId)
            if (actDef) {
                const projection = projectActTools(
                    rawPerformerId,
                    actDef,
                    request.actThreadId,
                )
                // Write tool files to execution dir
                await writeActToolFiles(executionDir, projection)
                actExtraTools = projection.tools
                actContextPrefix = projection.contextPrompt
            }
        } catch (err) {
            console.warn('[chat-service] Act tool projection failed:', err)
        }
    }

    const isAssistant = rawPerformerId === 'studio-assistant'
    let ensured: Awaited<ReturnType<typeof ensurePerformerProjection>> | null = null
    let assistantContextPrefix = ''
    let assistantAgentName: string | null = null
    let capabilitySnapshot: Awaited<ReturnType<typeof ensurePerformerProjection>>['capabilitySnapshot'] = null
    let toolResolution: Awaited<ReturnType<typeof ensurePerformerProjection>>['toolResolution'] = {
        selectedMcpServers: [],
        requestedTools: [],
        availableTools: [],
        resolvedTools: [],
        unavailableTools: [],
        unavailableDetails: [],
    }

    if (isAssistant) {
        const { buildAssistantActionPrompt, ensureAssistantAgent } = await import('./studio-assistant/assistant-service.js')
        assistantAgentName = await ensureAssistantAgent(executionDir)
        assistantContextPrefix = buildAssistantActionPrompt(request.assistantContext || null)
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
            // Pass Act runtime tools as extraTools so they're included in projection
            ...(actExtraTools.length > 0 ? { extraTools: actExtraTools } : {}),
        })
        capabilitySnapshot = ensured.capabilitySnapshot
        toolResolution = ensured.toolResolution
    }

    const unavailableSummary = describeUnavailableRuntimeTools(toolResolution)
    if (toolResolution.selectedMcpServers.length > 0 && toolResolution.resolvedTools.length === 0 && unavailableSummary) {
        throw new StudioValidationError(
            `Selected MCP servers are unavailable: ${unavailableSummary}.`,
            'fix_input',
        )
    }

    const promptSections = [assistantContextPrefix, actContextPrefix, request.message].filter(Boolean)
    const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'file'; mime: string; url: string; filename?: string }
    > = [{ type: 'text', text: promptSections.join('\n\n---\n\n') }]
    if (request.attachments && request.attachments.length > 0) {
        if (capabilitySnapshot && !capabilitySnapshot.attachment) {
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
        agent: isAssistant
            ? (assistantAgentName || undefined)
            : (ensured?.compiled.agentNames[performer.planMode ? 'plan' : 'build']),
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
