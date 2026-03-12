import type {
    ActMachineContext,
    ActSessionLifetime,
    ActSessionPolicy,
    ActThreadResumeSummary,
    StageActInput,
    StageActOrchestratorNode,
    StageActWorkerNode,
    ThreadSessionHandleRecord,
} from './act-runtime-types.js'

function extractJsonObject(text: string): string {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i)
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim()
    }

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Expected JSON object in orchestrator response.')
    }

    return text.slice(start, end + 1)
}

export function extractTextFromResponse(result: unknown): string {
    const record = result as Record<string, any>
    const structured = record?.data?.info?.structured ?? record?.info?.structured ?? record?.structured
    if (structured && typeof structured === 'object') {
        return JSON.stringify(structured)
    }
    const parts = [
        ...(record?.parts || []),
        ...(record?.data?.parts || []),
        ...(record?.info?.parts || []),
    ]

    const text = parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n')
        .trim()

    if (text) {
        return text
    }

    if (typeof record?.text === 'string' && record.text.trim()) {
        return record.text.trim()
    }

    return JSON.stringify(result)
}

export function parseOrchestratorDecision(
    text: string,
    routes: string[],
): { next: string; input: string; session?: { mode: 'fresh' | 'reuse'; handle?: string } } {
    const parsed = JSON.parse(extractJsonObject(text)) as {
        next?: unknown
        input?: unknown
        session?: { mode?: unknown; handle?: unknown }
    }
    const next = typeof parsed.next === 'string' ? parsed.next : ''
    const input = typeof parsed.input === 'string' ? parsed.input : ''
    const allowedRoutes = new Set([...routes, '$exit'])

    if (!allowedRoutes.has(next)) {
        throw new Error(`Orchestrator chose invalid route '${next}'. Allowed routes: ${Array.from(allowedRoutes).join(', ')}`)
    }

    const sessionMode = typeof parsed.session?.mode === 'string' ? parsed.session.mode : undefined
    const sessionHandle = typeof parsed.session?.handle === 'string' ? parsed.session.handle : undefined
    const session = sessionMode === 'fresh'
        ? { mode: 'fresh' as const }
        : sessionMode === 'reuse'
            ? { mode: 'reuse' as const, ...(sessionHandle ? { handle: sessionHandle } : {}) }
            : undefined

    return { next, input, ...(session ? { session } : {}) }
}

export function buildOrchestratorFormat(routes: string[]) {
    return {
        type: 'json_schema' as const,
        retryCount: 1,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['next', 'input'],
            properties: {
                next: {
                    type: 'string',
                    enum: [...routes, '$exit'],
                },
                input: {
                    type: 'string',
                },
                session: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['mode'],
                    properties: {
                        mode: {
                            type: 'string',
                            enum: ['fresh', 'reuse'],
                        },
                        handle: {
                            type: 'string',
                        },
                    },
                },
            },
        },
    }
}

export function summarizeText(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function buildColdStartResumeLines(summary: ActThreadResumeSummary | null | undefined) {
    if (!summary) {
        return []
    }

    const lines = [
        'This act thread was restored after a runtime restart. No live reusable node sessions are currently attached.',
        'Use the following as historical thread context only. Do not assume these previous handles are still reusable unless new live handles are listed separately.',
    ]

    if (summary.finalOutput) {
        lines.push(`Previous final output: ${summarizeText(summary.finalOutput)}`)
    }

    if (summary.error) {
        lines.push(`Previous error: ${summarizeText(summary.error)}`)
    }

    if (summary.currentNodeId) {
        lines.push(`Previous current node: ${summary.currentNodeId}`)
    }

    if (typeof summary.iterations === 'number') {
        lines.push(`Previous iterations: ${summary.iterations}`)
    }

    const nodeOutputs = Object.entries(summary.nodeOutputs || {})
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .slice(0, 6)
    if (nodeOutputs.length > 0) {
        lines.push('Previous node outputs:')
        for (const [nodeId, value] of nodeOutputs) {
            lines.push(`- ${nodeId}: ${summarizeText(value)}`)
        }
    }

    const history = (summary.history || []).slice(-8)
    if (history.length > 0) {
        lines.push('Recent act history:')
        for (const entry of history) {
            lines.push(`- ${entry.nodeId} (${entry.nodeType}): ${entry.action}`)
        }
    }

    const sessionHandles = (summary.sessionHandles || []).slice(0, 6)
    if (sessionHandles.length > 0) {
        lines.push('Previously warm thread handles (historical only):')
        for (const session of sessionHandles) {
            lines.push(`- ${session.handle}; node=${session.nodeId}; type=${session.nodeType}; turns=${session.turnCount}; summary=${session.summary || ''}`)
        }
    }

    return lines
}

export function buildActRuntimeSystem(
    context: ActMachineContext,
    node: StageActWorkerNode | StageActOrchestratorNode,
) {
    const lines = [
        '# Runtime Context',
        `Workflow: ${context.act.name}`,
        `Node: ${node.id} (${node.type})`,
        `Turn input: ${summarizeText(context.pendingInput)}`,
    ]

    if (context.actSessionId && context.threadSessionHandles.size === 0) {
        lines.push(...buildColdStartResumeLines(context.resumeSummary))
    }

    return lines.join('\n')
}

export function buildInitialSharedState(
    threadSessionHandles: Map<string, ThreadSessionHandleRecord>,
    coldStartResumeSummary: ActThreadResumeSummary | null,
) {
    return {
        sessionHandles: Array.from(threadSessionHandles.values()).map((session) => ({
            handle: session.handle,
            nodeId: session.nodeId,
            nodeType: session.nodeType,
            performerId: session.performerId,
            status: session.status,
            turnCount: session.turnCount,
            lastUsedAt: session.lastUsedAt,
            summary: session.summary,
        })),
        ...(coldStartResumeSummary ? {
            previousThreadSummary: {
                runId: coldStartResumeSummary.runId || null,
                currentNodeId: coldStartResumeSummary.currentNodeId || null,
                finalOutput: coldStartResumeSummary.finalOutput || null,
                error: coldStartResumeSummary.error || null,
                iterations: coldStartResumeSummary.iterations || 0,
            },
        } : {}),
    }
}

export function buildPersistentHandle(
    act: StageActInput,
    lifetime: ActSessionLifetime,
    policy: ActSessionPolicy,
    nodeId: string,
    performerId: string | null,
) {
    if (lifetime !== 'thread' || policy === 'fresh') {
        return null
    }
    if (policy === 'node') {
        return `node:${nodeId}:thread`
    }
    if (policy === 'performer') {
        return `performer:${performerId || 'unassigned'}:thread`
    }
    return `act:${act.id}:thread`
}

export function listAvailableSessionHandles(
    context: ActMachineContext,
    routes: string[],
): ThreadSessionHandleRecord[] {
    const allowedNodeIds = new Set(routes.filter((route) => route !== '$exit'))
    return Array.from(context.threadSessionHandles.values())
        .filter((handle) => allowedNodeIds.has(handle.nodeId))
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

function getOutgoingEdges(
    act: StageActInput,
    nodeId: string,
) {
    return act.edges.filter((edge) => edge.from === nodeId)
}

export function getOrchestratorRoutes(
    act: StageActInput,
    nodeId: string,
) {
    return getOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role !== 'branch')
        .map((edge) => edge.to)
}

export function getParallelBranches(
    act: StageActInput,
    nodeId: string,
) {
    return getOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role === 'branch' && edge.to !== '$exit')
        .map((edge) => edge.to)
}

export function selectNextTarget(act: StageActInput, nodeId: string, outcome: 'success' | 'fail'): string | null {
    const edges = getOutgoingEdges(act, nodeId).filter((edge) => edge.role !== 'branch')
    const preferredConditions = outcome === 'success'
        ? ['on_success', 'always', undefined]
        : ['on_fail', 'always', undefined]

    for (const condition of preferredConditions) {
        const match = edges.find((edge) => edge.condition === condition || (!edge.condition && condition === undefined))
        if (match) {
            return match.to
        }
    }

    return null
}

export function cloneContext(context: ActMachineContext): ActMachineContext {
    return {
        ...context,
        history: [...context.history],
        sharedState: { ...context.sharedState },
        nodeOutputs: { ...context.nodeOutputs },
        sessionPool: new Map(context.sessionPool),
        threadSessionHandles: new Map(context.threadSessionHandles),
    }
}
