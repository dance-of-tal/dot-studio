import { createActor, fromPromise, setup, toPromise, assign } from 'xstate'
import { readAsset } from 'dance-of-tal/lib/registry'
import type { Act } from 'dance-of-tal/data/types'
import { normalizeOpencodeError } from './opencode-errors.js'
import {
    clearActRuntimeAbortRequest,
    emitActRuntimeProgress,
    getThreadRuntimeHandles,
    isAbortRequested,
    isActRuntimeInterrupted,
    persistThreadRuntimeHandles,
    serializeSessionRecord,
    serializeThreadSessionHandle,
} from './act-runtime-events.js'
import {
    buildInitialSharedState,
    cloneContext,
    getOrchestratorRoutes,
    getParallelBranches,
    listAvailableSessionHandles,
    parseOrchestratorDecision,
    selectNextTarget,
} from './act-runtime-routing.js'
import {
    cleanupSessionPool,
    invokePerformer,
    rememberThreadHandle,
    releaseEphemeralSession,
} from './act-runtime-sessions.js'
import type {
    ActMachineContext,
    ActMachineOutput,
    ActSessionMode,
    RunActRuntimeInput,
    RuntimePerformer,
    StageActInput,
    StageActOrchestratorNode,
    StageActParallelNode,
    StageActWorkerNode,
    StagePerformerInput,
    StepResult,
    ThreadSessionHandleRecord,
} from './act-runtime-types.js'
import type { ModelSelection } from './prompt.js'

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeActSessionMode(mode: ActSessionMode | null | undefined): ActSessionMode {
    return mode === 'default' ? 'default' : 'all_nodes_thread'
}

function buildOrchestratorPrompt(
    input: string,
    routes: string[],
    availableSessions: ThreadSessionHandleRecord[],
): string {
    const sessionCatalog = availableSessions.length > 0
        ? [
            '',
            'Available reusable session handles for this thread:',
            ...availableSessions.map((session) => (
                `- handle=${session.handle}; node=${session.nodeId}; type=${session.nodeType}; turns=${session.turnCount}; lastUsedAt=${new Date(session.lastUsedAt).toISOString()}; summary=${session.summary || ''}`
            )),
            'If the next node should continue prior memory, respond with session.mode="reuse" and one of the handles for that node.',
            'If the next node should start fresh, respond with session.mode="fresh".',
        ].join('\n')
        : '\nNo reusable session handles are currently available for the allowed routes. Use session.mode="fresh" if you include a session field.'

    return [
        input,
        '',
        'You are an orchestrator. Your role is to read the input above and decide which node should handle it next.',
        'Choose the next route.',
        `Allowed next values: ${[...routes, '$exit'].join(', ')}`,
        sessionCatalog,
        'Respond with JSON only in this exact shape:',
        '{"next":"<nodeId|$exit>","input":"<string>","session":{"mode":"fresh"|"reuse","handle":"<handle when reusing>"}}',
    ].join('\n')
}

function describeActRuntimeError(
    error: unknown,
    context?: { model?: ModelSelection | null },
) {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    const normalized = normalizeOpencodeError(error, context?.model ? { model: context.model } : {})
    return normalized.error || normalized.detail || 'OpenCode request failed.'
}

function stageActFromRegistryAct(act: Act): { stageAct: StageActInput; performers: StagePerformerInput[] } {
    const performerIdByUrn = new Map<string, string>()
    const performers: StagePerformerInput[] = []

    for (const node of Object.values(act.nodes || {})) {
        if ((node.type === 'worker' || node.type === 'orchestrator') && typeof node.performer === 'string') {
            const performerUrn = node.performer.trim()
            if (!performerIdByUrn.has(performerUrn)) {
                const id = makeId('performer')
                performerIdByUrn.set(performerUrn, id)
                performers.push({
                    id,
                    name: performerUrn.split('/').pop() || 'Performer',
                    meta: { derivedFrom: performerUrn },
                    agentId: null,
                    modelVariant: null,
                    danceDeliveryMode: 'auto',
                    planMode: false,
                })
            }
        }
    }

    const stageAct: StageActInput = {
        id: makeId('act'),
        name: act.name,
        description: act.description,
        sessionMode: 'all_nodes_thread',
        meta: act.type.startsWith('act/') ? { derivedFrom: act.type } : undefined,
        entryNodeId: act.entryNode,
        nodes: Object.entries(act.nodes || {}).map(([id, node]) => {
            if (node.type === 'parallel') {
                return {
                    id,
                    type: 'parallel',
                    position: { x: 28, y: 56 },
                    join: node.join || 'all',
                } satisfies StageActParallelNode
            }
            if (node.type === 'orchestrator') {
                return {
                    id,
                    type: 'orchestrator',
                    performerId: performerIdByUrn.get(node.performer) || null,
                    modelVariant: null,
                    position: { x: 28, y: 56 },
                    maxDelegations: node.maxDelegations,
                    sessionPolicy: 'node',
                    sessionLifetime: 'thread',
                    sessionModeOverride: false,
                } satisfies StageActOrchestratorNode
            }
            return {
                id,
                type: 'worker',
                performerId: performerIdByUrn.get(node.performer) || null,
                modelVariant: null,
                position: { x: 28, y: 56 },
                sessionPolicy: 'fresh',
                sessionLifetime: 'run',
                sessionModeOverride: false,
            } satisfies StageActWorkerNode
        }),
        edges: (act.edges || []).map((edge, index) => ({
            id: `edge-${index + 1}`,
            from: edge.from,
            to: edge.to,
            ...(((edge as { role?: unknown }).role === 'branch') ? { role: 'branch' as const } : {}),
            condition: edge.condition,
        })),
        maxIterations: act.maxIterations || 10,
    }

    return { stageAct, performers }
}

async function loadActDefinition(cwd: string, actUrn: string): Promise<Act> {
    if (!actUrn.startsWith('act/')) {
        throw new Error(`Act URN must start with 'act/': ${actUrn}`)
    }

    const act = await readAsset(cwd, actUrn)
    if (!act) {
        throw new Error(`Act asset not found: ${actUrn}`)
    }

    return act as Act
}

async function resolvePerformer(_cwd: string, input: StagePerformerInput): Promise<RuntimePerformer> {
    return {
        id: input.id,
        name: input.name,
        model: input.model !== undefined ? input.model : null,
        modelVariant: input.modelVariant || null,
        agentId: input.agentId || (input.planMode ? 'plan' : 'build'),
        talRef: input.talRef !== undefined ? input.talRef : null,
        danceRefs: input.danceRefs !== undefined ? input.danceRefs : [],
        mcpServerNames: input.mcpServerNames !== undefined ? Array.from(new Set(input.mcpServerNames.filter(Boolean))) : [],
        danceDeliveryMode: input.danceDeliveryMode || 'auto',
        planMode: !!input.planMode,
    }
}

function normalizeStageActInput(act: StageActInput): StageActInput {
    return {
        ...act,
        sessionMode: normalizeActSessionMode(act.sessionMode),
        nodes: act.nodes.map((node) => {
            if (node.type === 'parallel') {
                return node
            }
            return {
                ...node,
                sessionModeOverride: !!node.sessionModeOverride,
            }
        }),
    }
}

async function resolveActRuntimeInput(input: RunActRuntimeInput): Promise<{
    act: StageActInput
    performers: RuntimePerformer[]
    drafts: Record<string, import('./act-runtime-types.js').RuntimeDraftAsset>
}> {
    let stageAct: StageActInput | null = input.stageAct || null
    let performerInputs: StagePerformerInput[] = input.performers || []

    if (!stageAct && input.actUrn) {
        const normalized = stageActFromRegistryAct(await loadActDefinition(input.cwd, input.actUrn))
        stageAct = normalized.stageAct
        performerInputs = normalized.performers
    }

    if (!stageAct) {
        throw new Error('Either stageAct or actUrn is required.')
    }

    const performers = await Promise.all(performerInputs.map((performer) => resolvePerformer(input.cwd, performer)))
    return { act: normalizeStageActInput(stageAct), performers, drafts: input.drafts || {} }
}

function buildNodeLookup(act: StageActInput) {
    return new Map(act.nodes.map((node) => [node.id, node]))
}

function transitionAfterNode(
    context: ActMachineContext,
    nodeId: string,
    outcome: 'success' | 'fail',
    output: string,
): StepResult {
    const next = selectNextTarget(context.act, nodeId, outcome)
    if (!next || next === '$exit') {
        return {
            status: outcome === 'success' ? 'completed' : 'failed',
            context: {
                ...context,
                currentNodeId: null,
                pendingInput: output,
                finalOutput: output,
            },
        }
    }

    return {
        status: 'continue',
        context: {
            ...context,
            currentNodeId: next,
            pendingInput: output,
        },
    }
}

async function runBranchMachine(
    context: ActMachineContext,
    startNodeId: string,
    input: string,
): Promise<ActMachineOutput> {
    const branchContext: ActMachineContext = {
        ...cloneContext(context),
        runId: `${context.runId}:${startNodeId}`,
        actSessionId: null,
        currentNodeId: startNodeId,
        pendingInput: input,
        iterations: 0,
        history: [],
        nodeOutputs: {},
        sessionPool: new Map(),
        pendingSessionDirective: null,
    }

    const result = await runActMachine(branchContext)
    await cleanupSessionPool(context.cwd, result.context.sessionPool, result.context.threadSessionHandles)
    return result
}

async function advanceRuntimeStep(context: ActMachineContext): Promise<StepResult> {
    const nextContext = cloneContext(context)
    if (isAbortRequested(nextContext.actSessionId)) {
        return {
            status: 'interrupted',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: 'Act run interrupted.',
            },
        }
    }
    if (!nextContext.currentNodeId) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                error: 'No current Act node selected.',
            },
        }
    }

    if (nextContext.iterations >= nextContext.maxIterations) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: `Act exceeded maxIterations (${nextContext.maxIterations}).`,
            },
        }
    }

    const node = buildNodeLookup(nextContext.act).get(nextContext.currentNodeId)
    if (!node) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: `Act node not found: ${nextContext.currentNodeId}`,
            },
        }
    }

    nextContext.iterations += 1
    nextContext.sharedState.currentNodeId = node.id
    nextContext.sharedState.iterations = nextContext.iterations
    const timestamp = Date.now()

    if (node.type === 'parallel') {
        const branches = getParallelBranches(nextContext.act, node.id)
        const branchRuns = await Promise.all(branches.map(async (branch) => {
            try {
                const result = await runBranchMachine(nextContext, branch, nextContext.pendingInput)
                return { result }
            } catch (error) {
                return { error: describeActRuntimeError(error) }
            }
        }))

        for (const branch of branchRuns) {
            if (branch.result) {
                nextContext.iterations += branch.result.context.iterations
                nextContext.history.push(...branch.result.context.history)
            }
        }

        const successful = branchRuns.filter((branch) => branch.result?.status === 'completed')
        const failed = branchRuns.filter((branch) => branch.error || branch.result?.status === 'failed')
        const success = node.join === 'any' ? successful.length > 0 : failed.length === 0
        const output = success
            ? (node.join === 'any'
                ? successful[0]?.result?.context.finalOutput || ''
                : successful.map((branch) => branch.result?.context.finalOutput || '').filter(Boolean).join('\n\n'))
            : failed.map((branch) => branch.error || branch.result?.context.error || branch.result?.context.finalOutput || 'Parallel branch failed').join('\n\n')

        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'parallel',
            action: success ? `parallel.completed:${node.join}` : `parallel.failed:${node.join}`,
            timestamp,
        })
        nextContext.nodeOutputs[node.id] = output
        nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
        return transitionAfterNode(nextContext, node.id, success ? 'success' : 'fail', output)
    }

    const performer = node.performerId ? nextContext.performersById[node.performerId] : null
    if (!performer) {
        const message = `Act node '${node.id}' does not have a resolved performer.`
        nextContext.history.push({
            nodeId: node.id,
            nodeType: node.type,
            action: `${node.type}.failed: ${message}`,
            timestamp,
        })
        return transitionAfterNode(nextContext, node.id, 'fail', message)
    }

    const pendingDirective = nextContext.pendingSessionDirective?.nodeId === node.id
        ? nextContext.pendingSessionDirective
        : null
    nextContext.pendingSessionDirective = null

    if (node.type === 'worker') {
        try {
            const invocation = await invokePerformer(
                nextContext,
                node,
                performer,
                nextContext.pendingInput,
                `Worker: ${node.id}`,
                pendingDirective,
            )
            const output = invocation.output
            const keepAlive = await rememberThreadHandle(nextContext, node, invocation.session, output)
            nextContext.history.push({ nodeId: node.id, nodeType: 'worker', action: 'worker.completed', timestamp })
            nextContext.nodeOutputs[node.id] = output
            nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
            nextContext.sharedState.sessionHandles = listAvailableSessionHandles(nextContext, nextContext.act.nodes.map((item) => item.id))
            await releaseEphemeralSession(nextContext.cwd, invocation.session, keepAlive)
            return transitionAfterNode(nextContext, node.id, 'success', output)
        } catch (error) {
            if (isActRuntimeInterrupted(error)) {
                return {
                    status: 'interrupted',
                    context: {
                        ...nextContext,
                        currentNodeId: null,
                        error: 'Act run interrupted.',
                    },
                }
            }
            const message = describeActRuntimeError(error, { model: performer.model })
            nextContext.history.push({ nodeId: node.id, nodeType: 'worker', action: `worker.failed: ${message}`, timestamp })
            return transitionAfterNode(nextContext, node.id, 'fail', `Worker '${node.id}' failed: ${message}`)
        }
    }

    // Enforce maxDelegations for orchestrator nodes
    if (typeof node.maxDelegations === 'number' && node.maxDelegations > 0) {
        const priorDelegations = nextContext.history.filter(
            (entry) => entry.nodeId === node.id && entry.action.startsWith('orchestrator.routed:'),
        ).length
        if (priorDelegations >= node.maxDelegations) {
            const message = `Orchestrator '${node.id}' exceeded maxDelegations (${node.maxDelegations}).`
            nextContext.history.push({
                nodeId: node.id,
                nodeType: 'orchestrator',
                action: `orchestrator.failed: ${message}`,
                timestamp,
            })
            return transitionAfterNode(nextContext, node.id, 'fail', message)
        }
    }

    const orchestratorRoutes = getOrchestratorRoutes(nextContext.act, node.id)

    try {
        const invocation = await invokePerformer(
            nextContext,
            node,
            performer,
            buildOrchestratorPrompt(
                nextContext.pendingInput,
                orchestratorRoutes,
                listAvailableSessionHandles(nextContext, orchestratorRoutes),
            ),
            `Orchestrator: ${node.id}`,
            pendingDirective,
        )
        const response = invocation.output
        const decision = parseOrchestratorDecision(response, orchestratorRoutes)
        if (decision.next !== '$exit' && decision.session?.mode === 'reuse') {
            const handle = decision.session.handle?.trim()
            if (!handle) {
                throw new Error(`Orchestrator selected session reuse for '${decision.next}' without a handle.`)
            }
            const handleRecord = nextContext.threadSessionHandles.get(handle)
            if (!handleRecord) {
                throw new Error(`Orchestrator selected unavailable session handle '${handle}'.`)
            }
            if (handleRecord.nodeId !== decision.next) {
                throw new Error(`Session handle '${handle}' belongs to '${handleRecord.nodeId}', not '${decision.next}'.`)
            }
        }
        const keepAlive = await rememberThreadHandle(nextContext, node, invocation.session, response)
        await releaseEphemeralSession(nextContext.cwd, invocation.session, keepAlive)
        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'orchestrator',
            action: `orchestrator.routed:${decision.next}`,
            timestamp,
        })
        nextContext.nodeOutputs[node.id] = decision.input || nextContext.pendingInput
        nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
        nextContext.sharedState.sessionHandles = listAvailableSessionHandles(nextContext, nextContext.act.nodes.map((item) => item.id))

        if (decision.next === '$exit') {
            return {
                status: 'completed',
                context: {
                    ...nextContext,
                    currentNodeId: null,
                    pendingSessionDirective: null,
                    pendingInput: decision.input || nextContext.pendingInput,
                    finalOutput: decision.input || nextContext.pendingInput,
                },
            }
        }

        return {
            status: 'continue',
            context: {
                ...nextContext,
                currentNodeId: decision.next,
                pendingInput: decision.input || nextContext.pendingInput,
                pendingSessionDirective: decision.next === '$exit' || !decision.session
                    ? null
                    : {
                        nodeId: decision.next,
                        mode: decision.session.mode,
                        ...(decision.session.handle ? { handle: decision.session.handle } : {}),
                    },
            },
        }
    } catch (error) {
        if (isActRuntimeInterrupted(error)) {
            return {
                status: 'interrupted',
                context: {
                    ...nextContext,
                    currentNodeId: null,
                    error: 'Act run interrupted.',
                },
            }
        }
        const message = describeActRuntimeError(error, { model: performer.model })
        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'orchestrator',
            action: `orchestrator.failed: ${message}`,
            timestamp,
        })
        return transitionAfterNode(nextContext, node.id, 'fail', `Orchestrator '${node.id}' failed: ${message}`)
    }
}

const actRuntimeMachine = setup({
    types: {
        context: {} as ActMachineContext,
        input: {} as ActMachineContext,
        output: {} as ActMachineOutput,
    },
    actors: {
        advance: fromPromise(async ({ input }: { input: ActMachineContext }) => advanceRuntimeStep(input)),
    },
}).createMachine({
    id: 'act-runtime',
    initial: 'executing',
    context: ({ input }) => input,
    states: {
        executing: {
            invoke: {
                src: 'advance',
                input: ({ context }) => context,
                onDone: [
                    {
                        guard: ({ event }) => event.output.status === 'continue',
                        actions: assign(({ event }) => event.output.context),
                        target: 'executing',
                        reenter: true,
                    },
                    {
                        guard: ({ event }) => event.output.status === 'completed',
                        actions: assign(({ event }) => event.output.context),
                        target: 'completed',
                    },
                    {
                        guard: ({ event }) => event.output.status === 'interrupted',
                        actions: assign(({ event }) => event.output.context),
                        target: 'interrupted',
                    },
                    {
                        actions: assign(({ event }) => event.output.context),
                        target: 'failed',
                    },
                ],
            },
        },
        completed: {
            type: 'final',
            output: ({ context }) => ({ status: 'completed', context }),
        },
        interrupted: {
            type: 'final',
            output: ({ context }) => ({ status: 'interrupted', context }),
        },
        failed: {
            type: 'final',
            output: ({ context }) => ({ status: 'failed', context }),
        },
    },
})

async function runActMachine(
    input: ActMachineContext,
    onProgress?: (context: ActMachineContext) => void,
): Promise<ActMachineOutput> {
    const actor = createActor(actRuntimeMachine, { input })
    let previousSignature = ''

    actor.subscribe((snapshot) => {
        if (!onProgress) {
            return
        }
        const context = snapshot.context
        const signature = [
            context.currentNodeId || '',
            context.iterations,
            context.history.length,
            context.finalOutput || '',
            context.error || '',
        ].join('::')

        if (signature === previousSignature) {
            return
        }
        previousSignature = signature
        onProgress(context)
    })

    actor.start()
    await toPromise(actor)
    const snapshot = actor.getSnapshot()
    return {
        status: snapshot.value === 'completed'
            ? 'completed'
            : snapshot.value === 'interrupted'
                ? 'interrupted'
                : 'failed',
        context: snapshot.context,
    }
}

export async function runActRuntime(input: RunActRuntimeInput) {
    clearActRuntimeAbortRequest(input.actSessionId)
    const resolved = await resolveActRuntimeInput(input)
    const performersById = Object.fromEntries(resolved.performers.map((performer) => [performer.id, performer]))
    const threadSessionHandles = getThreadRuntimeHandles(input.actSessionId, resolved.act.id)
    const coldStartResumeSummary = threadSessionHandles.size === 0 ? input.resumeSummary || null : null
    const initialContext: ActMachineContext = {
        runId: makeId('run'),
        actSessionId: input.actSessionId,
        cwd: input.cwd,
        act: resolved.act,
        performersById,
        drafts: resolved.drafts,
        currentNodeId: resolved.act.entryNodeId,
        pendingInput: input.input,
        maxIterations: input.maxIterations || resolved.act.maxIterations || 10,
        iterations: 0,
        history: [],
        sharedState: buildInitialSharedState(threadSessionHandles, coldStartResumeSummary),
        nodeOutputs: {},
        resumeSummary: coldStartResumeSummary,
        sessionPool: new Map(),
        threadSessionHandles,
        pendingSessionDirective: null,
    }

    emitActRuntimeProgress(initialContext, 'running')
    try {
        const result = await runActMachine(initialContext, (context) => {
            emitActRuntimeProgress(context, 'running')
        })
        persistThreadRuntimeHandles(input.actSessionId, resolved.act.id, result.context.threadSessionHandles)
        emitActRuntimeProgress(result.context, result.status)
        const response = {
            status: result.status,
            currentNodeId: result.context.currentNodeId,
            runId: result.context.runId,
            finalOutput: result.context.finalOutput,
            error: result.context.error,
            history: result.context.history,
            sharedState: result.context.sharedState,
            sessions: Array.from(result.context.sessionPool.values()).map((session) => serializeSessionRecord(session)),
            sessionHandles: Array.from(result.context.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
            iterations: result.context.iterations,
        }
        await cleanupSessionPool(initialContext.cwd, result.context.sessionPool, result.context.threadSessionHandles)
        return response
    } finally {
        clearActRuntimeAbortRequest(input.actSessionId)
    }
}
