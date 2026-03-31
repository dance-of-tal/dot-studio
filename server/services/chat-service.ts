import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { extractNonRetryableSessionError, waitForSessionToSettle } from '../lib/chat-session.js'
import { describeUnavailableRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { registerSessionExecutionContext } from '../lib/session-execution.js'
import { resolveActSessionPolicy, ACT_AGENT_POSTURE } from '../lib/act-session-policy.js'
import { ensurePerformerProjection } from './opencode-projection/stage-projection-service.js'
import { projectActTools } from './act-runtime/act-tool-projection.js'
import { getActDefinitionForThread, getActRuntimeService } from './act-runtime/act-runtime-service.js'

function isAssistantOwnerId(ownerId: string) {
    return ownerId === 'studio-assistant' || ownerId.startsWith('studio-assistant--')
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
    await registerSessionExecutionContext({
        sessionId: session.id,
        ownerKind,
        ownerId: contextOwnerId,
        workingDir: cwd,
    })

    // Persist participant→session mapping to thread.json for Act participants
    // ChatKey format: `act:{actId}:thread:{threadId}:participant:{participantKey}`
    if (request.actId && request.performerId.startsWith('act:')) {
        const threadMatch = request.performerId.match(/^act:[^:]+:thread:([^:]+):participant:(.+)$/)
        if (threadMatch) {
            const [, threadId, participantKey] = threadMatch
            try {
                const { getActRuntimeService } = await import('./act-runtime/act-runtime-service.js')
                const service = getActRuntimeService(cwd)
                await service.registerParticipantSession(threadId, participantKey, session.id)
            } catch {
                // Non-fatal: session still works, just won't persist for reload
            }
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

    // Extract raw performer key for Act-namespaced chatKeys
    // ChatKey format: `act:{actId}:thread:{threadId}:participant:{participantKey}`
    // We need just the participantKey part for Act tool generation
    let rawPerformerId = performer.performerId
    if (request.actId && performer.performerId.startsWith('act:')) {
        const participantPrefix = ':participant:'
        const participantIdx = performer.performerId.indexOf(participantPrefix)
        if (participantIdx !== -1) {
            rawPerformerId = performer.performerId.slice(participantIdx + participantPrefix.length)
        }
    }

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
        ensured = await ensurePerformerProjection({
            performerId: rawPerformerId,
            performerName: performer.performerName,
            talRef: performer.talRef,
            danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
            model: performer.model,
            modelVariant: performer.modelVariant || null,
            mcpServerNames: performer.mcpServerNames || [],
            workingDir,
            ...(request.actId ? { scope: 'act' as const, actId: request.actId } : {}),
            ...(collaborationPromptSection ? { collaborationPromptSection } : {}),
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
            parts,
        }))
    } catch (error) {
        if (actRuntime && rawPerformerId) {
            await actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId).catch(() => {})
        }
        throw error
    }

    if (actRuntime && rawPerformerId) {
        void waitForSessionToSettle(
            oc,
            sessionId,
            { directory: workingDir },
            { timeoutMs: 30 * 60_000, pollMs: 250, requireObservedBusy: true },
        ).then((settled) => {
            if (!settled) {
                console.warn(`[chat-service] Session ${sessionId} for "${rawPerformerId}" did not settle before timeout`)
                return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
            }
            return Promise.resolve(oc.session.messages({
                sessionID: sessionId,
                directory: workingDir,
            })).then((response) => {
                const rawMessages = unwrapOpencodeResult<unknown>(response)
                const messages = Array.isArray(rawMessages) ? rawMessages : []
                const fatalError = extractNonRetryableSessionError(messages)
                if (fatalError) {
                    void actRuntime.tripParticipantAutoWakeCircuit(request.actThreadId!, rawPerformerId, fatalError)
                    console.warn(`[chat-service] Opened auto-wake circuit for "${rawPerformerId}": ${fatalError}`)
                    return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
                }

                void actRuntime.clearParticipantAutoWakeCircuit(request.actThreadId!, rawPerformerId)
                return actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
            })
        }).catch((error) => {
            console.error(`[chat-service] Failed waiting for act session ${sessionId} to settle:`, error)
            void actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId)
        })
    }

    return { accepted: true as const }
}
