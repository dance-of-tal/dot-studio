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
    description: "Create or update a shared note for the whole team. Use this for durable context, decisions, findings, and handoffs.",
    args: {
        entryKey: tool.schema.string().describe("Stable key for the shared note, such as api-spec or review-report"),
        entryType: tool.schema.enum(["artifact", "fact", "task"]).describe("Type of shared note"),
        content: tool.schema.string().describe("Entry content"),
        mode: tool.schema.enum(["replace", "append"]).optional().describe("Whether to replace or append to an existing shared note"),
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
    description: "Read shared notes created by the team. Returns matching entries as JSON.",
    args: {
        entryKey: tool.schema.string().optional().describe("Optional shared note key. Omit to read all shared notes."),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const params = args.entryKey ? "&key=" + encodeURIComponent(args.entryKey) : ""
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/read-shared-board?workingDir=${wd}\` + params)
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
    description: "Pause until a condition is met, then resume with the provided instruction. Use this when you are waiting for more input or a shared update.",
    args: {
        resumeWith: tool.schema.string().describe("Instruction to receive when the wait is over"),
        conditionJson: tool.schema.string().describe("JSON condition expression. Supported types: all_of, any_of, board_key_exists, message_received, timeout"),
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
