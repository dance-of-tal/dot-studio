import type {
    ActMachineContext,
    ActThreadResumeSummary,
    StageActInput,
    StageActWorkerNode,
    ThreadSessionHandleRecord,
} from './act-runtime-types.js'

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

export function summarizeText(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function buildColdStartResumeLines(summary: ActThreadResumeSummary | null | undefined) {
    if (!summary) {
        return []
    }

    const lines = [
        'This act thread was restored after a runtime restart.',
        'Use the following as historical context only.',
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

    const history = (summary.history || []).slice(-8)
    if (history.length > 0) {
        lines.push('Recent act history:')
        for (const entry of history) {
            lines.push(`- ${entry.nodeId}: ${entry.action}`)
        }
    }

    return lines
}

export function buildActRuntimeSystem(
    context: ActMachineContext,
    node: StageActWorkerNode,
) {
    const lines = [
        '# Runtime Context',
        `Workflow: ${context.act.name}`,
        `Node: ${node.id}`,
        `Turn input: ${summarizeText(context.pendingInput)}`,
    ]

    const outgoingEdges = context.act.edges.filter((edge) => edge.from === node.id)
    if (outgoingEdges.length > 0) {
        lines.push(
            'Outgoing request relations:',
            ...outgoingEdges.map((edge) => `- ${edge.to}${edge.description ? `: ${edge.description}` : ''}`),
        )
    }

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

export function buildPersistentHandle(nodeId: string) {
    return `node:${nodeId}:thread`
}

export function getNextTargets(
    act: StageActInput,
    nodeId: string,
) {
    return act.edges
        .filter((edge) => edge.from === nodeId)
        .map((edge) => edge.to)
}
