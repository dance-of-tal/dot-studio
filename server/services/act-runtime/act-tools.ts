/**
 * act-tools.ts — Act runtime custom tool definitions
 *
 * PRD §13: Tools exposed to participants in Act context.
 * - send_message (fire-and-forget)
 * - post_to_board
 * - read_board
 * - set_wake_condition
 *
 * These are generated as OpenCode custom tool .ts files and placed in
 * the participant's .opencode/tools/ directory during Act context projection.
 */

import type { ConditionExpr } from '../../../shared/act-types.js'
import { PORT } from '../../lib/config.js'

// ── Tool parameter interfaces ───────────────────────────

export interface SendMessageParams {
    to: string
    content: string
    tag?: string
}

export interface PostToBoardParams {
    key: string
    kind: 'artifact' | 'fact' | 'task'
    content: string
    updateMode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

export interface ReadBoardParams {
    key?: string
}

export interface SetWakeConditionParams {
    target: 'self'
    onSatisfiedMessage: string
    condition: ConditionExpr
}

// ── Tool file content generators ────────────────────────

function sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}

export function generateSendMessageTool(actId: string, threadId: string, participantKey: string): { name: string; content: string } {
    const name = `act_send_message_${sanitizeToolName(actId)}`
    const content = `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Send a message to another participant in this Act. Fire-and-forget: you will not receive a direct response.",
    args: {
        to: tool.schema.string().describe("Target participant key to send the message to"),
        content: tool.schema.string().describe("Message content"),
        tag: tool.schema.string().optional().describe("Optional tag for the message (e.g. review-request, clarification)"),
    },
    async execute(args) {
        const res = await fetch("http://localhost:${PORT}/api/act/${actId}/thread/${threadId}/send-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: ${JSON.stringify(participantKey)},
                to: args.to,
                content: args.content,
                tag: args.tag,
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Message sent successfully."
    },
})
`
    return { name, content }
}

export function generatePostToBoardTool(actId: string, threadId: string, participantKey: string): { name: string; content: string } {
    const name = `act_post_to_board_${sanitizeToolName(actId)}`
    const content = `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Post or update an entry on the shared board. Board entries are durable and visible to all participants.",
    args: {
        key: tool.schema.string().describe("Board entry key (e.g. api-spec, review-report)"),
        kind: tool.schema.enum(["artifact", "fact", "task"]).describe("Entry kind"),
        content: tool.schema.string().describe("Entry content"),
        updateMode: tool.schema.enum(["replace", "append"]).optional().describe("How to update existing entries"),
    },
    async execute(args) {
        const res = await fetch("http://localhost:${PORT}/api/act/${actId}/thread/${threadId}/post-to-board", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                author: ${JSON.stringify(participantKey)},
                key: args.key,
                kind: args.kind,
                content: args.content,
                updateMode: args.updateMode || "replace",
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Board entry posted successfully."
    },
})
`
    return { name, content }
}

export function generateReadBoardTool(actId: string, threadId: string): { name: string; content: string } {
    const name = `act_read_board_${sanitizeToolName(actId)}`
    const content = `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Read entries from the shared board. Returns board entries as JSON.",
    args: {
        key: tool.schema.string().optional().describe("Specific board key to read. Omit to get all entries."),
    },
    async execute(args) {
        const params = args.key ? "?key=" + encodeURIComponent(args.key) : ""
        const res = await fetch("http://localhost:${PORT}/api/act/${actId}/thread/${threadId}/read-board" + params)
        const data = await res.json()
        if (!data.ok) return data.error
        return JSON.stringify(data.entries, null, 2)
    },
})
`
    return { name, content }
}

export function generateSetWakeConditionTool(actId: string, threadId: string, participantKey: string): { name: string; content: string } {
    const name = `act_set_wake_condition_${sanitizeToolName(actId)}`
    const content = `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Set a wake condition: you will be woken up when the condition is satisfied. Use this to wait for multiple results before proceeding.",
    args: {
        onSatisfiedMessage: tool.schema.string().describe("Message to receive when the condition is satisfied"),
        conditionJson: tool.schema.string().describe("JSON string of the condition expression. Supported types: all_of, any_of, board_key_exists, message_received, timeout"),
    },
    async execute(args) {
        let condition
        try {
            condition = JSON.parse(args.conditionJson)
        } catch {
            return "Error: conditionJson must be valid JSON"
        }
        const res = await fetch("http://localhost:${PORT}/api/act/${actId}/thread/${threadId}/set-wake-condition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                createdBy: ${JSON.stringify(participantKey)},
                target: "self",
                onSatisfiedMessage: args.onSatisfiedMessage,
                condition,
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Wake condition set. You will be woken up when the condition is satisfied."
    },
})
`
    return { name, content }
}

/**
 * Get all Act runtime tools for a participant in a thread.
 */
export function getActToolsForParticipant(
    actId: string,
    threadId: string,
    participantKey: string,
): Array<{ name: string; content: string }> {
    return [
        generateSendMessageTool(actId, threadId, participantKey),
        generatePostToBoardTool(actId, threadId, participantKey),
        generateReadBoardTool(actId, threadId),
        generateSetWakeConditionTool(actId, threadId, participantKey),
    ]
}
