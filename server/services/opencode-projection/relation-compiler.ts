/**
 * Relation Compiler — Compiles performer relation edges into OpenCode projection components.
 *
 * For each performer, this produces:
 * 1. `permission.task` allowlist (frontmatter) — restricts which agents can be called via task tool
 * 2. Relations prompt section (body) — describes available interaction targets and semantics
 *
 * PRD §7.5: "Act relation은 다음 surface로 projection된다:
 *   - Performer prompt body에 relation semantics 설명 삽입
 *   - permission.task allowlist로 호출 가능한 target 제한"
 */

export interface PerformerRelationInput {
    id: string
    from: string
    to: string
    interaction: string // 'request' in v1
    description: string
}

export interface PerformerRelationContext {
    /** Name lookup: performerId → performer display name */
    names: Record<string, string>
    /** Agent name lookup: performerId → projected agent name (e.g., dot-studio/stage/<hash>/<id>--build) */
    agentNames: Record<string, string>
}

export interface CompiledRelations {
    /** Agent names this performer is allowed to call via `task` tool */
    taskAllowlist: string[]
    /** Prompt section describing relations (injected into agent body) */
    promptSection: string | null
}

/**
 * Compile relations for a specific performer.
 *
 * @param performerId - The performer whose relations are being compiled
 * @param relations - All relation edges in the stage
 * @param ctx - Performer name and agent name lookup context
 */
export function compileRelations(
    performerId: string,
    relations: PerformerRelationInput[],
    ctx: PerformerRelationContext,
): CompiledRelations {
    // Find outgoing relations (this performer is the source)
    const outgoing = relations.filter(r => r.from === performerId)

    if (outgoing.length === 0) {
        return {
            taskAllowlist: [],
            promptSection: null,
        }
    }

    // Build permission.task allowlist — agent names of target performers
    const taskAllowlist = outgoing
        .map(r => ctx.agentNames[r.to])
        .filter(Boolean)

    // Build prompt section
    const lines: string[] = [
        '# Performer Relations',
        '',
        'You have the following relations with other performers. Use the `task` tool to delegate work to them.',
        '',
    ]

    for (const rel of outgoing) {
        const targetName = ctx.names[rel.to] || rel.to
        const targetAgent = ctx.agentNames[rel.to] || rel.to

        lines.push(`## ${targetName}`)
        lines.push(`- **Interaction**: ${rel.interaction}`)
        lines.push(`- **Agent**: \`${targetAgent}\``)
        if (rel.description) {
            lines.push(`- **Description**: ${rel.description}`)
        }
        lines.push(`- Use \`task\` tool with agent="${targetAgent}" to delegate work to this performer.`)
        lines.push('')
    }

    return {
        taskAllowlist,
        promptSection: lines.join('\n'),
    }
}

/**
 * Generate permission.task frontmatter lines for agent file.
 */
export function buildPermissionTaskFrontmatter(allowlist: string[]): string[] {
    if (allowlist.length === 0) {
        return []
    }

    const lines = ['permission:']
    lines.push('  task:')
    for (const agent of allowlist) {
        lines.push(`    - ${agent}`)
    }
    return lines
}
