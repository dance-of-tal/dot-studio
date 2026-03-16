/**
 * relation-compiler.ts — Compiles Act relations into custom tools + prompt sections
 *
 * For each relation, generates:
 * 1. A custom tool .ts file that calls POST /api/act/delegate
 * 2. A prompt section describing the relation (optional or required)
 * 3. A permission.task allowlist entry
 */

import { PORT } from '../../lib/config.js'

// ── Types ───────────────────────────────────────────────

export interface RelationCompileInput {
    id: string
    from: string
    to: string
    name: string
    description: string
    invocation: 'optional' | 'required'
    await: boolean
    sessionPolicy: 'fresh' | 'reuse'
    maxCalls: number
    timeout: number
}

export interface RelationTarget {
    performerId: string
    performerName: string
    agentName: string
}

export interface CompiledRelation {
    /** Custom tool file to write to .opencode/tools/ */
    tool: {
        name: string
        content: string
    }
    /** Prompt section to inject into agent .md body */
    promptLine: string
    /** Agent name for permission.task allowlist */
    taskAllowEntry: string
}

export interface CompiledRelations {
    tools: Array<{ name: string; content: string }>
    taskAllowlist: string[]
    promptSection: string | null
}

// ── Tool file generation ────────────────────────────────

function sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}

function generateToolFileContent(
    relation: RelationCompileInput,
    target: RelationTarget,
    actId: string,
    port: number,
): string {
    const desc = relation.description || `Delegate to ${target.performerName}`
    return `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: ${JSON.stringify(desc)},
    args: {
        prompt: tool.schema.string().describe("Request content to send to ${target.performerName}"),
    },
    async execute(args, context) {
        const res = await fetch("http://localhost:${port}/api/act/delegate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                actId: ${JSON.stringify(actId)},
                relationId: ${JSON.stringify(relation.id)},
                callerSessionId: context.sessionID,
                prompt: args.prompt,
                targetAgentName: ${JSON.stringify(target.agentName)},
                description: ${JSON.stringify(desc)},
                awaitResult: ${relation.await},
                sessionPolicy: ${JSON.stringify(relation.sessionPolicy)},
                maxCalls: ${relation.maxCalls},
                timeout: ${relation.timeout},
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return data.result
    },
})
`
}

// ── Prompt section generation ───────────────────────────

function generatePromptLine(relation: RelationCompileInput, target: RelationTarget): string {
    const desc = relation.description || `Delegate to ${target.performerName}`
    const awaitHint = relation.await ? 'waits for result' : 'fire-and-forget'
    return `- **${target.performerName}**: use \`${sanitizeToolName(relation.name)}\` tool — ${desc} (${awaitHint})`
}

function generateMandatorySection(relations: Array<{ relation: RelationCompileInput; target: RelationTarget }>): string {
    const lines = [
        '## MANDATORY Workflow Rules',
        '',
        '⚠️ You MUST use the following tools as part of your workflow.',
        'Do NOT report completion to the user until you have completed all mandatory delegations.',
        '',
    ]
    for (const { relation, target } of relations) {
        const desc = relation.description || `Delegate to ${target.performerName}`
        lines.push(`- **REQUIRED**: Call \`${sanitizeToolName(relation.name)}\` — ${desc}`)
    }
    lines.push('')
    return lines.join('\n')
}

// ── Main compiler ───────────────────────────────────────

export function compileRelations(
    relations: RelationCompileInput[],
    targets: Map<string, RelationTarget>,
    actId: string,
    stageHash: string,
): CompiledRelations {
    if (relations.length === 0) {
        return { tools: [], taskAllowlist: [], promptSection: null }
    }

    const tools: Array<{ name: string; content: string }> = []
    const taskAllowlist: string[] = []
    const optionalLines: string[] = []
    const requiredRelations: Array<{ relation: RelationCompileInput; target: RelationTarget }> = []

    const port = PORT

    for (const relation of relations) {
        const target = targets.get(relation.to)
        if (!target) continue

        // Generate custom tool file
        const toolName = `dot_studio__${stageHash}__${actId}__${sanitizeToolName(relation.name)}`
        tools.push({
            name: toolName,
            content: generateToolFileContent(relation, target, actId, port),
        })

        // Add to task allowlist (defense in depth)
        taskAllowlist.push(target.agentName)

        // Categorize for prompt section
        if (relation.invocation === 'required') {
            requiredRelations.push({ relation, target })
        } else {
            optionalLines.push(generatePromptLine(relation, target))
        }
    }

    // Build prompt section
    const promptParts: string[] = []

    if (requiredRelations.length > 0) {
        promptParts.push(generateMandatorySection(requiredRelations))
    }

    if (optionalLines.length > 0) {
        promptParts.push('## Available Collaborators\n')
        promptParts.push('The following tools allow you to delegate work to other performers when useful.\n')
        promptParts.push(...optionalLines)
        promptParts.push('')
    }

    return {
        tools,
        taskAllowlist,
        promptSection: promptParts.length > 0 ? promptParts.join('\n') : null,
    }
}

// ── Legacy compat (used by chat-service @mention flow) ──

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

export function compileMentionRelations(targets: RequestRelationTarget[]): CompiledRequestRelations {
    if (targets.length === 0) {
        return { taskAllowlist: [], promptSection: null }
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
