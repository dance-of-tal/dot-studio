/**
 * act-tools.ts — Act runtime custom tool definitions
 *
 * PRD §13: Collaboration tools exposed to participants.
 * - message_teammate
 * - update_shared_board
 * - read_shared_board
 * - wait_until
 *
 * These are 4 generic static tool files placed in .opencode/tools/.
 * The model only provides high-level collaboration inputs.
 * Act/thread/participant identity is resolved from the current session.
 */

import { PORT } from '../../lib/config.js'

// ── Tool parameter interfaces ───────────────────────────

export interface SendMessageParams {
    recipient: string
    message: string
    tag?: string
}

export interface PostToBoardParams {
    entryKey: string
    entryType: 'artifact' | 'fact' | 'task'
    content: string
    mode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

export interface ReadBoardParams {
    entryKey?: string
    mode?: 'summary' | 'full'
}

export interface SetWakeConditionParams {
    resumeWith: string
    conditionJson: string
}

export const COLLABORATION_TOOL_NAMES = [
    'message_teammate',
    'update_shared_board',
    'read_shared_board',
    'wait_until',
] as const

export const LEGACY_COLLABORATION_TOOL_NAMES = [
    'act_send_message',
    'act_post_to_board',
    'act_read_board',
    'act_set_wake_condition',
] as const

// ── Static tool definitions ─────────────────────────────

/**
 * The 4 generic Act runtime tools.
 * These are static and session-bound.
 * The workingDir is baked in at write time (changes per workspace, not per thread).
 */
export function getStaticActTools(workingDir: string): Array<{ name: string; content: string }> {
    const wd = encodeURIComponent(workingDir)
    const base = `http://localhost:${PORT}`

    return [
        {
            name: 'message_teammate',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Send a direct message to a teammate. Use this for targeted coordination when only one teammate needs the update.",
    args: {
        recipient: tool.schema.string().describe("Teammate name to message directly"),
        message: tool.schema.string().describe("Message to send"),
        tag: tool.schema.string().optional().describe("Optional short label for the message"),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/message-teammate?workingDir=${wd}\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient: args.recipient,
                message: args.message,
                tag: args.tag,
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Direct message sent."
    },
})
`,
        },
        {
            name: 'update_shared_board',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Create or update a shared note for the whole team. Keep entries compact and durable: decisions, findings, task status, and handoffs.",
    args: {
        entryKey: tool.schema.string().describe("Stable key for the shared note, such as api-spec or review-report"),
        entryType: tool.schema.enum(["artifact", "fact", "task"]).describe("Type of shared note"),
        content: tool.schema.string().describe("Compact entry content. Prefer a fresh summary over a long transcript or raw dump."),
        mode: tool.schema.enum(["replace", "append"]).optional().describe("How to update an existing shared note. Prefer replace; append is only for short incremental additions."),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/update-shared-board?workingDir=${wd}\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entryKey: args.entryKey,
                entryType: args.entryType,
                content: args.content,
                mode: args.mode,
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Shared note updated."
    },
})
`,
        },
        {
            name: 'read_shared_board',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Read shared notes created by the team. By default this returns a recent summarized view; pass a specific key for the exact entry you need.",
    args: {
        entryKey: tool.schema.string().optional().describe("Optional shared note key. Pass this when you know the relevant key you need."),
        mode: tool.schema.enum(["summary", "full"]).optional().describe("Optional board read mode when no key is provided. Use full only when you truly need a full-board resync."),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const params = new URLSearchParams()
        if (args.entryKey) params.set("key", args.entryKey)
        if (!args.entryKey && args.mode === "full") params.set("summaryOnly", "false")
        const qs = params.toString()
        const suffix = qs ? "&" + qs : ""
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/read-shared-board?workingDir=${wd}\` + suffix)
        const data = await res.json()
        if (!data.ok) return data.error
        return JSON.stringify(data.entries, null, 2)
    },
})
`,
        },
        {
            name: 'wait_until',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Pause until a condition is met, then resume with the provided instruction. Use this to self-wake when you are blocked on a teammate message, board update, timeout, or a combined condition.",
    args: {
        resumeWith: tool.schema.string().describe("Instruction to receive when the wait is over, such as 'Resume once review-summary exists and send the next handoff'."),
        conditionJson: tool.schema.string().describe('JSON condition expression. Supported types: all_of, any_of, board_key_exists, message_received, timeout. Example: {"type":"board_key_exists","key":"review-summary"}'),
    },
    async execute(args, context) {
        let condition
        try {
            condition = JSON.parse(args.conditionJson)
        } catch {
            return "Error: conditionJson must be valid JSON"
        }
        const sessionID = context.sessionID
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/wait-until?workingDir=${wd}\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                resumeWith: args.resumeWith,
                condition,
            }),
        })
        const data = await res.json()
        if (!data.ok) return data.error
        return "Wait condition saved. You will resume when it is satisfied."
    },
})
`,
        },
    ]
}
