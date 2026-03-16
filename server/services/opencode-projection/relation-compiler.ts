export interface RequestRelationTarget {
    performerId: string
    performerName: string
    agentName: string
    description?: string
}

export interface CompiledRequestRelations {
    taskAllowlist: string[]
    promptSection: string | null
}

export function compileRequestRelations(targets: RequestRelationTarget[]): CompiledRequestRelations {
    if (targets.length === 0) {
        return {
            taskAllowlist: [],
            promptSection: null,
        }
    }

    const lines = [
        '# Available Agents',
        '',
        'The following agents are available for request-style delegation in this context.',
        'Use the `task` tool only when it is actually useful, and only with the allowed agent names below.',
        '',
    ]

    for (const target of targets) {
        lines.push(`- **${target.performerName}**: use \`task\` with agent="${target.agentName}"${target.description ? ` — ${target.description}` : ''}`)
    }

    return {
        taskAllowlist: targets.map((target) => target.agentName),
        promptSection: lines.join('\n'),
    }
}
