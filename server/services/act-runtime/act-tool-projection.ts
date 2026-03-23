/**
 * act-tool-projection.ts — Act tool projection for participant sessions
 *
 * Replaces the old act-compiler.ts relation→custom tool approach.
 * Projects Act runtime tools (send_message, post_to_board, read_board, set_wake_condition)
 * and Act context into participant sessions.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ActDefinition } from '../../../shared/act-types.js'
import { getActToolsForParticipant } from './act-tools.js'
import { buildActContext } from './act-context-builder.js'

// ── Types ───────────────────────────────────────────────

export interface ActToolProjection {
    /** Act context markdown to inject into agent prompt */
    contextPrompt: string
    /** Custom tool files to write to .opencode/tools/ */
    tools: Array<{ name: string; content: string }>
}

// ── Projection ──────────────────────────────────────────

/**
 * Generate Act tool projection for a participant in a thread.
 * Creates tool definitions and Act context prompt.
 */
export function projectActTools(
    participantKey: string,
    actDefinition: ActDefinition,
    threadId: string,
): ActToolProjection {
    // 1. Act context prompt
    const contextPrompt = buildActContext(actDefinition, participantKey)

    // 2. Runtime tool definitions
    const tools = getActToolsForParticipant(actDefinition.id, threadId, participantKey)

    return {
        contextPrompt,
        tools,
    }
}

/**
 * Write Act tool files to the participant's execution directory.
 */
export async function writeActToolFiles(
    executionDir: string,
    projection: ActToolProjection,
): Promise<string[]> {
    const toolsDir = join(executionDir, '.opencode', 'tools')
    await fs.mkdir(toolsDir, { recursive: true })

    const writtenPaths: string[] = []
    for (const tool of projection.tools) {
        const filePath = join(toolsDir, `${tool.name}.ts`)
        await fs.writeFile(filePath, tool.content, 'utf-8')
        writtenPaths.push(filePath)
    }

    return writtenPaths
}

/**
 * Clean up Act tool files from a participant's execution directory.
 */
export async function cleanActToolFiles(
    executionDir: string,
    actId: string,
): Promise<void> {
    const toolsDir = join(executionDir, '.opencode', 'tools')
    try {
        const files = await fs.readdir(toolsDir)
        const actPrefix = `act_`
        for (const file of files) {
            if (file.startsWith(actPrefix) && file.includes(actId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())) {
                await fs.unlink(join(toolsDir, file))
            }
        }
    } catch {
        // Directory may not exist
    }
}
