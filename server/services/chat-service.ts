import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { describeUnavailableRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { resolveActSessionPolicy, ACT_AGENT_POSTURE } from '../lib/act-session-policy.js'
import { ensurePerformerProjection } from './opencode-projection/stage-projection-service.js'
import {
    parseActParticipantSessionOwner,
    registerActParticipantSession,
    syncActParticipantStatusForSession,
} from './act-runtime/act-session-runtime.js'
import {
    formatActSessionError,
    resolveActSessionSettlementOutcome,
} from './act-runtime/act-session-settlement.js'
import { projectActTools } from './act-runtime/act-tool-projection.js'
import { getActDefinitionForThread, getActRuntimeService } from './act-runtime/act-runtime-service.js'
import { prepareRuntimeForExecution, throwIfRuntimePreparationBlocked } from './runtime-preparation-service.js'
import { createSessionOwnership } from './session-ownership-service.js'

function isAssistantOwnerId(ownerId: string) {
    return ownerId === 'studio-assistant' || ownerId.startsWith('studio-assistant--')
}

async function syncActParticipantSessionFailure(sessionId: string, error: unknown) {
    await syncActParticipantStatusForSession(sessionId, {
        type: 'error',
        message: formatActSessionError(error),
    }).catch(() => {})
}

export async function createStudioChatSession(
    cwd: string,
    request: ChatSessionCreateRequest,
) {
    const oc = await getOpencode()
    const isAct = !!request.actId
    const actPolicy = isAct ? resolveActSessionPolicy(request.actId!) : null
    const ownerKind = isAct ? actPolicy!.ownerKind : 'performer' as const
    // Use the full chatKey as the session context owner so each
    // Act participant session resolves back to the correct tab and execution scope.
    const contextOwnerId = request.performerId
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: cwd,
        title: buildStudioSessionTitle(request.performerId, request.performerName, request.configHash),
    }))
    await createSessionOwnership({
        sessionId: session.id,
        ownerKind,
        ownerId: contextOwnerId,
        workingDir: cwd,
    })

    if (request.actId) {
        try {
            await registerActParticipantSession(cwd, contextOwnerId, session.id)
        } catch {
            // Non-fatal: session still works, just won't persist for reload.
        }
    }

    return {
        sessionId: session.id,
        title: session.title,
    }
}

export async function sendStudioChatMessage(
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

    const actSessionOwner = request.actId
        ? parseActParticipantSessionOwner(performer.performerId)
        : null
    const rawPerformerId = actSessionOwner?.participantKey || performer.performerId

    // ── Collaboration tool projection ───────────────────
    // When running in an Act thread, project stable collaboration context and
    // collaboration tools into the participant session.
    let actExtraTools: Array<{ name: string; content: string }> = []
    let collaborationPromptSection = ''

    if (request.actId && request.actThreadId) {
        try {
            const actDef = await getActDefinitionForThread(workingDir, request.actThreadId)
            if (actDef) {
                const projection = projectActTools(
                    rawPerformerId,
                    actDef,
                    request.actThreadId,
                    workingDir,
                )
                actExtraTools = projection.tools
                collaborationPromptSection = projection.contextPrompt
            }
        } catch (err) {
            console.warn('[chat-service] Act tool projection failed:', err)
        }
    }

    const isAssistant = isAssistantOwnerId(rawPerformerId)
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
        const {
            buildAssistantActionPrompt,
            buildAssistantDiscoveryPrompt,
            ensureAssistantAgent,
        } = await import('./studio-assistant/assistant-service.js')
        assistantAgentName = await ensureAssistantAgent(workingDir)
        const discoveryPrompt = await buildAssistantDiscoveryPrompt(workingDir, request.message)
        assistantContextPrefix = [
            buildAssistantActionPrompt(request.assistantContext || null),
            discoveryPrompt,
        ].filter(Boolean).join('\n\n')
    } else {
        const prepared = await prepareRuntimeForExecution(workingDir, () => ensurePerformerProjection({
            performerId: rawPerformerId,
            performerName: performer.performerName,
            talRef: performer.talRef,
            danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
            model: performer.model!,
            modelVariant: performer.modelVariant || null,
            mcpServerNames: performer.mcpServerNames || [],
            workingDir,
            ...(request.actId ? { scope: 'act' as const, actId: request.actId } : {}),
            ...(collaborationPromptSection ? { collaborationPromptSection } : {}),
            ...(actExtraTools.length > 0 ? { extraTools: actExtraTools } : {}),
        }))
        throwIfRuntimePreparationBlocked(prepared)
        ensured = prepared.payload
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

    const promptSections = [isAssistant ? '' : assistantContextPrefix, request.message].filter(Boolean)
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
    const actRuntime = request.actId && request.actThreadId
        ? getActRuntimeService(workingDir)
        : null

    if (actRuntime && rawPerformerId) {
        await actRuntime.beginUserTurn(request.actThreadId!)
        await actRuntime.markParticipantSessionBusy(request.actThreadId!, rawPerformerId)
    }

    try {
        unwrapOpencodeResult(await oc.session.promptAsync({
            sessionID: sessionId,
            directory: workingDir,
            agent: isAssistant
                ? (assistantAgentName || undefined)
                // Act scope always uses build agent, ignoring performer planMode
                : (ensured?.compiled.agentNames[
                    request.actId ? ACT_AGENT_POSTURE : (performer.planMode ? 'plan' : 'build')
                  ]),
            // Pass model directly so OpenCode uses the user's selected model,
            // not the (potentially stale) model cached from the agent file.
            model: performer.model ? {
                providerID: performer.model.provider,
                modelID: performer.model.modelId,
            } : undefined,
            system: isAssistant ? (assistantContextPrefix || undefined) : undefined,
            tools: isAssistant ? undefined : ensured?.toolMap,
            parts,
        }))
    } catch (error) {
        await syncActParticipantSessionFailure(sessionId, error)
        if (actRuntime && rawPerformerId) {
            await actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId).catch(() => {})
        }
        throw error
    }

    if (actRuntime && rawPerformerId) {
        void resolveActSessionSettlementOutcome(
            oc,
            sessionId,
            workingDir,
            { timeoutMs: 30 * 60_000, pollMs: 250, requireObservedBusy: true },
        ).then((outcome) => {
            if (outcome.kind === 'timeout') {
                console.warn(`[chat-service] Session ${sessionId} for "${rawPerformerId}" did not settle before timeout`)
                void syncActParticipantStatusForSession(sessionId, {
                    type: 'error',
                    message: outcome.message,
                }).catch(() => {})
                return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
            }

            if (outcome.kind === 'fatal_error') {
                void syncActParticipantStatusForSession(sessionId, {
                    type: 'error',
                    message: outcome.message,
                }).catch(() => {})
                void actRuntime.tripParticipantAutoWakeCircuit(request.actThreadId!, rawPerformerId, outcome.message)
                console.warn(`[chat-service] Opened auto-wake circuit for "${rawPerformerId}": ${outcome.message}`)
                return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
            }

            void syncActParticipantStatusForSession(sessionId, { type: 'idle' }).catch(() => {})
            void actRuntime.clearParticipantAutoWakeCircuit(request.actThreadId!, rawPerformerId)
            return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
        }).catch((error) => {
            console.error(`[chat-service] Failed waiting for act session ${sessionId} to settle:`, error)
            void syncActParticipantSessionFailure(sessionId, error)
            void actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
        })
    }

    return { accepted: true as const }
}
