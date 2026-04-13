import { getOpencode } from '../lib/opencode.js'
import { buildStudioSessionTitle, deriveProvisionalThreadTitle } from '../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../shared/chat-contracts.js'
import { describeUnavailableRuntimeTools } from '../lib/runtime-tools.js'
import { StudioValidationError, unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { retryOnAgentRegistryMiss } from '../lib/opencode-prompt.js'
import { resolveActSessionPolicy } from '../lib/act-session-policy.js'
import { ensurePerformerProjection } from './opencode-projection/stage-projection-service.js'
import { buildProjectionExecutionPlan } from './opencode-projection/projection-execution-plan.js'
import { buildProjectionDirtyPatch } from './opencode-projection/projection-dirty-patch.js'
import {
    parseActParticipantSessionOwner,
    registerActParticipantSession,
    syncActParticipantStatusForSession,
} from './act-runtime/act-session-runtime.js'
import {
    formatActSessionError,
    resolveActSessionSettlementOutcome,
} from './act-runtime/act-session-settlement.js'
import { buildActToolMap, ensureActToolFiles } from './act-runtime/act-tool-files.js'
import { projectActTools } from './act-runtime/act-tool-projection.js'
import { getActDefinitionForThread, getActRuntimeService } from './act-runtime/act-runtime-service.js'
import { prepareRuntimeForExecution, throwIfRuntimePreparationBlocked } from './runtime-preparation-service.js'
import { publishProjectionConsumed } from './runtime-execution-events.js'
import { countRunningSessions } from './runtime-reload-service.js'
import { createSessionOwnership } from './session-ownership-service.js'
import {
    maybeGenerateActThreadName,
    maybeGenerateStandaloneSessionTitle,
    sessionHasUserMessages,
    setInitialActThreadName,
    setInitialStandaloneSessionTitle,
} from './thread-title-service.js'
import { prepareAssistantChatRequest } from './studio-assistant/assistant-chat-service.js'
import { buildTextPromptParts, joinPromptSections } from './turn-prompt-service.js'
import { normalizeProjectionDirtyPatch } from '../../shared/projection-dirty.js'

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
    let actSystemPrompt = ''
    let projectionPerformerId = rawPerformerId
    let projectionPerformerName = performer.performerName

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
                actSystemPrompt = projection.systemPrompt

                const { resolvePerformerForWake } = await import('./act-runtime/wake-performer-resolver.js')
                const resolvedPerformer = await resolvePerformerForWake(workingDir, actDef, rawPerformerId).catch(() => null)
                if (resolvedPerformer?.performerId) {
                    projectionPerformerId = resolvedPerformer.performerId
                    projectionPerformerName = resolvedPerformer.performerName
                }
            }
        } catch (err) {
            console.warn('[chat-service] Act tool projection failed:', err)
        }
    }

    const projectionDirtyPatch = buildProjectionDirtyPatch({
        performerId: projectionPerformerId || null,
        actId: request.actId || null,
        talRef: request.performer.talRef,
        danceRefs: [...(request.performer.danceRefs || []), ...(request.performer.extraDanceRefs || [])],
    })
    const requestedProjectionScope = normalizeProjectionDirtyPatch(request.projectionScope)

    const isAssistant = isAssistantOwnerId(rawPerformerId)
    let ensured: Awaited<ReturnType<typeof ensurePerformerProjection>> | null = null
    let assistantSystemPrompt = ''
    let assistantAgentName: string | null = null
    let promptTools: Record<string, boolean> | undefined
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
        const prepared = await prepareAssistantChatRequest(workingDir, {
            message: request.message,
            model: performer.model!,
            assistantContext: request.assistantContext || null,
        })
        assistantAgentName = prepared.assistantAgentName
        capabilitySnapshot = prepared.capabilitySnapshot
        promptTools = prepared.promptTools
        assistantSystemPrompt = prepared.systemPrompt
    } else {
        const projectionPlan = await buildProjectionExecutionPlan({
            workingDir,
            target: {
                performerId: projectionPerformerId,
                performerName: projectionPerformerName,
                talRef: performer.talRef,
                danceRefs: [...(performer.danceRefs || []), ...(performer.extraDanceRefs || [])],
                model: performer.model!,
                modelVariant: performer.modelVariant || null,
                mcpServerNames: performer.mcpServerNames || [],
                workingDir,
            },
            targetPatch: projectionDirtyPatch,
            requestedPatch: requestedProjectionScope,
        })
        const prepared = await prepareRuntimeForExecution(workingDir, async () => {
            let primaryProjection: Awaited<ReturnType<typeof ensurePerformerProjection>> | null = null
            let changed = false

            for (const input of projectionPlan.inputs) {
                const nextProjection = await ensurePerformerProjection(input)
                if (input.performerId === projectionPerformerId) {
                    primaryProjection = nextProjection
                }
                changed = changed || nextProjection.changed
            }

            if (!primaryProjection) {
                throw new Error(`Missing projection for performer ${projectionPerformerId}`)
            }

            return {
                ...primaryProjection,
                changed,
            }
        })
        throwIfRuntimePreparationBlocked(prepared)
        ensured = prepared.payload
        if (prepared.requiresDispose) {
            publishProjectionConsumed(workingDir, projectionPlan.consumedPatch)
        }
        promptTools = request.actId
            ? { ...ensured.toolMap, ...buildActToolMap() }
            : ensured.toolMap
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

    const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'file'; mime: string; url: string; filename?: string }
    > = buildTextPromptParts(request.message)
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
    const shouldGenerateThreadTitle = !isAssistant
        && request.message.trim().length > 0
        && !(await sessionHasUserMessages(workingDir, sessionId).catch(() => true))
    const provisionalTitle = shouldGenerateThreadTitle
        ? deriveProvisionalThreadTitle(request.message)
        : null

    if (actRuntime && rawPerformerId) {
        await actRuntime.beginUserTurn(request.actThreadId!)
        await actRuntime.markParticipantSessionBusy(request.actThreadId!, rawPerformerId)
    }

    if (shouldGenerateThreadTitle && provisionalTitle) {
        if (request.actId && request.actThreadId) {
            await setInitialActThreadName({
                workingDir,
                actId: request.actId,
                threadId: request.actThreadId,
                provisionalTitle,
            }).catch((error) => {
                console.warn(`[chat-service] Failed to seed Act thread name for ${request.actThreadId}:`, error)
            })
        } else {
            await setInitialStandaloneSessionTitle({
                sessionId,
                provisionalTitle,
            }).catch((error) => {
                console.warn(`[chat-service] Failed to seed standalone thread title for ${sessionId}:`, error)
            })
        }
    }

    try {
        if (request.actId) {
            await ensureActToolFiles(workingDir, workingDir)
        }
        const agentName = isAssistant
            ? (assistantAgentName || undefined)
            : (ensured?.compiled.agentNames[
                request.actId ? 'build' : (performer.planMode ? 'plan' : 'build')
            ])

        await retryOnAgentRegistryMiss({
            oc,
            directory: workingDir,
            agentName,
            getRunningSessions: async (directory) => (await countRunningSessions(directory)).runningSessions,
            logLabel: 'chat-service',
            run: async () => unwrapOpencodeResult(await oc.session.promptAsync({
                sessionID: sessionId,
                directory: workingDir,
                agent: agentName,
                // Pass model directly so OpenCode uses the user's selected model,
                // not the (potentially stale) model cached from the agent file.
                model: performer.model ? {
                    providerID: performer.model.provider,
                    modelID: performer.model.modelId,
                } : undefined,
                system: joinPromptSections([
                    request.actId ? actSystemPrompt : '',
                    isAssistant ? assistantSystemPrompt : '',
                ]),
                tools: promptTools,
                parts,
            })),
        })
    } catch (error) {
        await syncActParticipantSessionFailure(sessionId, error)
        if (actRuntime && rawPerformerId) {
            await actRuntime.drainParticipantQueue(request.actThreadId!, rawPerformerId).catch(() => {})
        }
        throw error
    }

    if (shouldGenerateThreadTitle) {
        if (request.actId && request.actThreadId) {
            void maybeGenerateActThreadName({
                workingDir,
                actId: request.actId,
                threadId: request.actThreadId,
                message: request.message,
                model: {
                    providerID: performer.model.provider,
                    modelID: performer.model.modelId,
                },
                provisionalTitle,
            }).catch((error) => {
                console.warn(`[chat-service] Failed to generate Act thread name for ${request.actThreadId}:`, error)
            })
        } else {
            void maybeGenerateStandaloneSessionTitle({
                workingDir,
                sessionId,
                message: request.message,
                model: {
                    providerID: performer.model.provider,
                    modelID: performer.model.modelId,
                },
                provisionalTitle,
            }).catch((error) => {
                console.warn(`[chat-service] Failed to generate standalone thread title for ${sessionId}:`, error)
            })
        }
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
