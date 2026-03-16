/**
 * act-compiler.ts — Compiles Act projection
 *
 * Uses Act's copied performer configs (not standalone) to project
 * into the act-scoped namespace: .opencode/agents/dot-studio/act/<stageHash>/<actId>/
 *
 * Each relation generates a custom tool file + prompt section + permission.task entry.
 */

import type { PerformerProjectionInput, EnsuredPerformerProjection } from './stage-projection-service.js'
import { ensurePerformerProjection, getProjectedAgentName } from './stage-projection-service.js'
import { compileRelations, type RelationCompileInput, type RelationTarget } from './relation-compiler.js'
import { createHash } from 'crypto'

function computeStageHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

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
    name: string
    description: string
    invocation: 'optional' | 'required'
    await: boolean
    sessionPolicy: 'fresh' | 'reuse'
    maxCalls: number
    timeout: number
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
 * Relations generate custom tool files + prompt sections.
 */
export async function compileActProjection(input: ActCompileInput): Promise<CompiledActProjection> {
    const performerProjections: Record<string, EnsuredPerformerProjection> = {}
    const stageHash = computeStageHash(input.workingDir)

    for (const [sourceId, actPerformer] of Object.entries(input.actPerformers)) {
        if (!actPerformer.model) {
            continue
        }

        // Outgoing relations for this performer
        const outgoingRelations = input.relations.filter((rel) => rel.from === sourceId)

        // Build relation compile inputs and target map
        const relationInputs: RelationCompileInput[] = []
        const targetMap = new Map<string, RelationTarget>()

        for (const rel of outgoingRelations) {
            const targetPerformer = input.actPerformers[rel.to]
            if (!targetPerformer) continue

            const targetAgentName = getProjectedAgentName(
                input.workingDir, rel.to, 'build', 'act', input.actId,
            )

            relationInputs.push({
                id: rel.id,
                from: rel.from,
                to: rel.to,
                name: rel.name,
                description: rel.description,
                invocation: rel.invocation,
                await: rel.await,
                sessionPolicy: rel.sessionPolicy,
                maxCalls: rel.maxCalls,
                timeout: rel.timeout,
            })

            targetMap.set(rel.to, {
                performerId: rel.to,
                performerName: targetPerformer.name,
                agentName: targetAgentName,
            })
        }

        // Compile relations → custom tools + prompt + allowlist
        const compiled = compileRelations(relationInputs, targetMap, input.actId, stageHash)

        // Build legacy requestTargets for permission.task compatibility
        const requestTargets = outgoingRelations
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
            extraTools: compiled.tools,
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
