/**
 * act-tool-projection.ts — Act tool projection for participant sessions
 *
 * Builds stable collaboration system prompt content for participant sessions.
 */

import type { ActDefinition } from '../../../shared/act-types.js'
import { buildActContext } from './act-context-builder.js'

// ── Types ───────────────────────────────────────────────

export interface ActToolProjection {
    /** Stable collaboration context to inject into the turn-scoped system prompt */
    systemPrompt: string
}

// ── Projection ──────────────────────────────────────────

/**
 * Generate the turn-scoped Act collaboration prompt for a participant.
 */
export function projectActTools(
    participantKey: string,
    actDefinition: ActDefinition,
    threadId: string,
    workingDir: string,
): ActToolProjection {
    void threadId
    void workingDir

    const systemPrompt = buildActContext(actDefinition, participantKey)

    return {
        systemPrompt,
    }
}
