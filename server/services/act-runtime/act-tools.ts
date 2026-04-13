/**
 * act-tools.ts — Act runtime custom tool definitions
 *
 * PRD §13: Collaboration tools exposed to participants.
 * - message_teammate
 * - update_shared_board
 * - list_shared_board
 * - get_shared_board_entry
 * - wait_until
 *
 * These are generic static tool files placed in .opencode/tools/.
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
    entryType: 'artifact' | 'finding' | 'task'
    content: string
    mode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

export interface ListBoardParams {
    kind?: 'artifact' | 'finding' | 'task'
    mode?: 'summary' | 'full'
}

export interface GetBoardEntryParams {
    entryKey: string
}

export interface SetWakeConditionParams {
    resumeWith: string
    conditionJson: string
}

export const COLLABORATION_TOOL_NAMES = [
    'message_teammate',
    'update_shared_board',
    'list_shared_board',
    'get_shared_board_entry',
    'wait_until',
] as const

// Old tool filenames kept only so projection cleanup and permission deny-lists
// can remove stale artifacts from existing workspaces.
export const STALE_COLLABORATION_TOOL_NAMES = [
    'act_send_message',
    'act_post_to_board',
    'act_read_board',
    'act_set_wake_condition',
    'read_shared_board',
] as const

// ── Static tool definitions ─────────────────────────────

/**
 * The generic Act runtime tools.
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
    description: "Send a direct message to a teammate. Use this for targeted coordination when only one teammate needs the update. Pass the teammate display name as recipient, not a relation name.",
    args: {
        recipient: tool.schema.string().describe("Teammate display name to message directly. Do not pass relation names like participant_1_to_participant_2."),
        message: tool.schema.string().describe("Message to send"),
        tag: tool.schema.string().optional().describe("Optional short label for the message. Reuse teammate-facing tags when they fit; if you invent a new tag, keep the message body understandable without it."),
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
    description: "Create or update a shared note for the whole team. Prefer short Markdown summaries for decisions, findings, task status, and handoffs. Do not paste full deliverables or long raw dumps.",
    args: {
        entryKey: tool.schema.string().describe("Stable key for the shared note, such as api-spec or review-report. Reuse the same key for the same workstream; prefer teammate-facing key patterns when you want them to notice the update."),
        entryType: tool.schema.enum(["artifact", "finding", "task"]).describe("Type of shared note"),
        content: tool.schema.string().describe("Compact Markdown entry content. Prefer a fresh summary over a long transcript or raw dump."),
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
            name: 'list_shared_board',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "List recent shared notes on the board. Use this when you need to see what exists before choosing an exact key.",
    args: {
        kind: tool.schema.enum(["artifact", "finding", "task"]).optional().describe("Optional shared note kind filter. Use this instead of passing values like artifact or recent as a key."),
        mode: tool.schema.enum(["summary", "full"]).optional().describe("Optional list detail mode. Use full only when you truly need a full-board resync."),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const params = new URLSearchParams()
        if (args.kind) params.set("kind", args.kind)
        if (args.mode === "full") params.set("summaryOnly", "false")
        const qs = params.toString()
        const suffix = qs ? "&" + qs : ""
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/list-shared-board?workingDir=${wd}\` + suffix)
        const data = await res.json()
        if (!data.ok) return data.error
        return JSON.stringify(data.entries, null, 2)
    },
})
`,
        },
        {
            name: 'get_shared_board_entry',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Read one exact shared note by key. Pass the literal key you want, such as review-report. Do not pass values like recent or artifact here.",
    args: {
        entryKey: tool.schema.string().describe("Exact shared note key to read."),
    },
    async execute(args, context) {
        const sessionID = context.sessionID
        const params = new URLSearchParams()
        params.set("key", args.entryKey)
        const res = await fetch(\`${base}/api/act/session/\${encodeURIComponent(sessionID)}/get-shared-board-entry?workingDir=${wd}&\` + params.toString())
        const data = await res.json()
        if (!data.ok) return data.error
        return JSON.stringify(data.entry, null, 2)
    },
})
`,
        },
        {
            name: 'wait_until',
            content: `import { tool } from "@opencode-ai/plugin"

export default tool({
    description: "Pause until a condition is met, then resume with the provided instruction. Use this to set a self-wake alarm when you are blocked on a teammate message, board update, a scheduled wake, or a combined condition.",
    args: {
        resumeWith: tool.schema.string().describe("Instruction to receive when the wait is over, such as 'Resume once review-summary exists and send the next handoff'."),
        conditionJson: tool.schema.string().describe('JSON condition expression. Use message_received, board_key_exists, wake_at, or compose them with all_of/any_of. Example scheduled self-wake: {"type":"wake_at","at":1735689600000}'),
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
        return "Wait condition saved. End your turn now and do not call more collaboration tools until you are resumed."
    },
})
`,
        },
    ]
}
