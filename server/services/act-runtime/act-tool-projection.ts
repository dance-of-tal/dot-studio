/**
 * act-tool-projection.ts — Act tool projection for performer sessions
 *
 * Replaces the old act-compiler.ts relation→custom tool approach.
 * Projects Act runtime tools (send_message, post_to_board, read_board, set_wake_condition)
 * and Act context into performer sessions.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ActDefinition } from '../../../shared/act-types.js'
import { getActToolsForPerformer } from './act-tools.js'
import { buildActContext } from './act-context-builder.js'
import { Mailbox } from './mailbox.js'

// ── Types ───────────────────────────────────────────────

export interface ActToolProjection {
    /** Act context markdown to inject into agent prompt */
    contextPrompt: string
    /** Custom tool files to write to .opencode/tools/ */
    tools: Array<{ name: string; content: string }>
}

// ── Projection ──────────────────────────────────────────

/**
 * Generate Act tool projection for a performer in a thread.
 * Creates tool definitions and Act context prompt.
 */
export function projectActTools(
    performerKey: string,
    actDefinition: ActDefinition,
    threadId: string,
    _executionDir: string,
): ActToolProjection {
    // 1. Act context prompt
    const mailbox = new Mailbox()  // Fresh mailbox for context building (runtime state comes from thread)
    const contextPrompt = buildActContext(actDefinition, performerKey, mailbox)

    // 2. Runtime tool definitions
    const tools = getActToolsForPerformer(actDefinition.id, threadId, performerKey)

    return {
        contextPrompt,
        tools,
    }
}

/**
 * Write Act tool files to the performer's execution directory.
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
 * Clean up Act tool files from a performer's execution directory.
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
