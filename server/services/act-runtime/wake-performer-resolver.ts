/**
 * wake-performer-resolver.ts — Resolve performer config for wake cascade
 *
 * When the wake cascade auto-wakes a participant, it needs the performer's
 * model, TAL, Dance, and MCP configuration to properly project into OpenCode.
 * This module reads workspace.json to find the matching performer node.
 */

import type { ActDefinition } from '../../../shared/act-types.js'
import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import {
    listWorkspacePerformersForDir,
    type WorkspacePerformerSnapshot,
} from '../workspace-service.js'

export interface ResolvedPerformerConfig {
    performerId: string
    performerName: string
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    mcpServerNames: string[]
    agentId: string | null
    planMode: boolean
}

/**
 * Resolve the performer config for a participant in an Act.
 * Reads the saved workspace snapshot to find the performer matching the
 * participant's performerRef (draft id or registry URN).
 *
 * Returns null if:
 * - the workspace snapshot is not available
 * - participant not in actDefinition
 * - no matching performer in workspace
 */
export async function resolvePerformerForWake(
    workingDir: string,
    actDefinition: ActDefinition,
    participantKey: string,
): Promise<ResolvedPerformerConfig | null> {
    const binding = actDefinition.participants[participantKey]
    if (!binding) return null

    const ref = binding.performerRef

    // Read workspace.json to find performers
    const performers = await listWorkspacePerformersForDir(workingDir)
    if (performers.length === 0) {
        console.warn(`[wake-resolver] Cannot read performers for workspace ${workingDir}`)
        return null
    }

    // Match performer by ref
    const performer = matchPerformer(performers, ref)
    if (!performer) {
        console.warn(
            `[wake-resolver] No matching performer for participant "${participantKey}" ref=${JSON.stringify(ref)}`,
        )
        return null
    }

    return {
        performerId: performer.id,
        performerName: performer.name,
        model: performer.model,
        modelVariant: performer.modelVariant ?? null,
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        mcpServerNames: performer.mcpServerNames || [],
        agentId: performer.agentId ?? null,
        planMode: performer.planMode ?? false,
    }
}

function matchPerformer(
    performers: WorkspacePerformerSnapshot[],
    ref: SharedAssetRef,
): WorkspacePerformerSnapshot | null {
    if (ref.kind === 'draft') {
        return (
            performers.find((p) => p.id === ref.draftId) ||
            performers.find((p) => p.meta?.derivedFrom === `draft:${ref.draftId}`) ||
            null
        )
    }

    if (ref.kind === 'registry') {
        return (
            performers.find((p) => p.meta?.derivedFrom === ref.urn) ||
            null
        )
    }

    return null
}
