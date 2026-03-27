/**
 * act-tool-projection.ts — Act tool projection for participant sessions
 *
 * Projects collaboration tools and stable collaboration context into participant sessions.
 *
 * Tools are generic static files. Stable collaboration context is intended
 * for agent/system-level injection rather than per-turn user prompt injection.
 */

import type { ActDefinition } from '../../../shared/act-types.js'
import { getStaticActTools } from './act-tools.js'
import { buildActContext } from './act-context-builder.js'

// ── Types ───────────────────────────────────────────────

export interface ActToolProjection {
    /** Stable collaboration context to inject into the agent/system prompt */
    contextPrompt: string
    /** Custom tool files to write to .opencode/tools/ */
    tools: Array<{ name: string; content: string }>
}

// ── Projection ──────────────────────────────────────────

/**
 * Generate Act tool projection for a participant in a thread.
 * Creates tool definitions and stable collaboration context.
 */
export function projectActTools(
    participantKey: string,
    actDefinition: ActDefinition,
    threadId: string,
    workingDir: string,
): ActToolProjection {
    void threadId

    // 1. Stable collaboration context for agent/system injection
    const contextPrompt = buildActContext(actDefinition, participantKey)

    // 2. Static session-bound tool definitions (only workingDir is baked in)
    const tools = getStaticActTools(workingDir)

    return {
        contextPrompt,
        tools,
    }
}
