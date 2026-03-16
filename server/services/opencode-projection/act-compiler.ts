/**
 * act-compiler.ts — Compiles Act projection
 *
 * Uses Act's copied performer configs (not standalone) to project
 * into the act-scoped namespace: .opencode/agents/dot-studio/act/<stageHash>/<actId>/
 */

import type { PerformerProjectionInput, EnsuredPerformerProjection } from './stage-projection-service.js'
import { ensurePerformerProjection, getProjectedAgentName } from './stage-projection-service.js'

interface ActPerformerConfig {
    sourcePerformerId: string
    name: string
    talRef: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null
    danceRefs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    mcpServerNames: string[]
    agentId: string | null
    planMode: boolean
}

interface ActRelation {
    id: string
    from: string
    to: string
    interaction: 'request'
    description: string
}

export interface ActCompileInput {
    actId: string
    actPerformers: Record<string, ActPerformerConfig>
    relations: ActRelation[]
    executionDir: string
    workingDir: string
    drafts: Record<string, any>
}

export interface CompiledActProjection {
    performerProjections: Record<string, EnsuredPerformerProjection>
}

/**
 * Compiles all performers in an Act using their copied configs.
 * Each performer is projected into the act-scoped namespace.
 */
export async function compileActProjection(input: ActCompileInput): Promise<CompiledActProjection> {
    const performerProjections: Record<string, EnsuredPerformerProjection> = {}

    for (const [sourceId, actPerformer] of Object.entries(input.actPerformers)) {
        if (!actPerformer.model) {
            continue
        }

        // Build request targets for this performer based on relations
        const requestTargets = input.relations
            .filter((rel) => rel.from === sourceId)
            .map((rel) => {
                const target = input.actPerformers[rel.to]
                return target ? {
                    performerId: rel.to,
                    performerName: target.name,
                    description: rel.description || '',
                } : null
            })
            .filter(Boolean) as PerformerProjectionInput['requestTargets']

        const ensured = await ensurePerformerProjection({
            performerId: sourceId,
            performerName: actPerformer.name,
            talRef: actPerformer.talRef,
            danceRefs: actPerformer.danceRefs,
            drafts: input.drafts,
            model: actPerformer.model,
            modelVariant: actPerformer.modelVariant,
            mcpServerNames: actPerformer.mcpServerNames,
            executionDir: input.executionDir,
            workingDir: input.workingDir,
            requestTargets,
            scope: 'act',
            actId: input.actId,
        })

        performerProjections[sourceId] = ensured
    }

    return { performerProjections }
}

/**
 * Get the projected agent name for an act-scoped performer.
 */
export function getActProjectedAgentName(
    workingDir: string,
    actId: string,
    performerId: string,
    posture: 'build' | 'plan',
) {
    // Uses the act-scoped naming: dot-studio/act/<stageHash>/<actId>/<performerId>--<posture>
    return getProjectedAgentName(workingDir, performerId, posture, 'act', actId)
}
