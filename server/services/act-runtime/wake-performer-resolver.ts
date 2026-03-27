/**
 * wake-performer-resolver.ts — Resolve performer config for wake cascade
 *
 * When the wake cascade auto-wakes a participant, it needs the performer's
 * model, TAL, Dance, and MCP configuration to properly project into OpenCode.
 * This module reads workspace.json to find the matching performer node.
 */

import type { ActDefinition } from '../../../shared/act-types.js'
import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import { workspaceIdForDir, workspaceDir } from '../../lib/config.js'
import fs from 'fs/promises'
import path from 'path'

export interface ResolvedPerformerConfig {
    performerName: string
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    mcpServerNames: string[]
    agentId: string | null
    planMode: boolean
    executionMode: 'direct' | 'safe'
}

/**
 * Workspace performer shape — subset of PerformerNode fields needed here.
 * Not importing the full client type to avoid coupling server→client code.
 */
interface WorkspacePerformer {
    id: string
    name: string
    model: { provider: string; modelId: string } | null
    modelVariant?: string | null
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    mcpServerNames: string[]
    agentId?: string | null
    planMode?: boolean
    executionMode?: 'direct' | 'safe'
    meta?: {
        derivedFrom?: string | null
    }
}

/**
 * Resolve the performer config for a participant in an Act.
 * Reads the workspace.json file to find the performer matching the
 * participant's performerRef (draft id or registry URN).
 *
 * Returns null if:
 * - workspace.json not found
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
    const wsId = workspaceIdForDir(workingDir)
    const wsPath = path.join(workspaceDir(wsId), 'workspace.json')

    let performers: WorkspacePerformer[]
    try {
        const raw = await fs.readFile(wsPath, 'utf-8')
        const parsed = JSON.parse(raw)
        performers = Array.isArray(parsed.performers) ? parsed.performers : []
    } catch {
        console.warn(`[wake-resolver] Cannot read workspace at ${wsPath}`)
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
        performerName: performer.name,
        model: performer.model,
        modelVariant: performer.modelVariant ?? null,
        talRef: performer.talRef,
        danceRefs: performer.danceRefs || [],
        mcpServerNames: performer.mcpServerNames || [],
        agentId: performer.agentId ?? null,
        planMode: performer.planMode ?? false,
        executionMode: performer.executionMode || 'direct',
    }
}

function matchPerformer(
    performers: WorkspacePerformer[],
    ref: SharedAssetRef,
): WorkspacePerformer | null {
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
