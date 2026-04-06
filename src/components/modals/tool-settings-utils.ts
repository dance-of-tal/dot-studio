export type ToolPermissionMode = 'allow' | 'ask' | 'deny'

export interface BuiltinToolDefinition {
    id: string
    permissionKey: string
    label: string
    description: string
    aliases?: string[]
    note?: string
}

const KNOWN_PERMISSION_VALUES = new Set<ToolPermissionMode>(['allow', 'ask', 'deny'])

export const BUILTIN_TOOL_DEFINITIONS: BuiltinToolDefinition[] = [
    {
        id: 'bash',
        permissionKey: 'bash',
        label: 'Shell',
        description: 'Execute shell commands in the project environment.',
    },
    {
        id: 'read',
        permissionKey: 'read',
        label: 'Read',
        description: 'Read file contents from the workspace.',
    },
    {
        id: 'edit',
        permissionKey: 'edit',
        label: 'Edit',
        description: 'Modify files in the workspace.',
        aliases: ['write', 'apply_patch'],
        note: 'OpenCode controls write and apply_patch through the edit permission.',
    },
    {
        id: 'grep',
        permissionKey: 'grep',
        label: 'Grep',
        description: 'Search file contents with patterns.',
    },
    {
        id: 'glob',
        permissionKey: 'glob',
        label: 'Glob',
        description: 'Match files by glob pattern.',
    },
    {
        id: 'list',
        permissionKey: 'list',
        label: 'List',
        description: 'List files and directories.',
    },
    {
        id: 'lsp',
        permissionKey: 'lsp',
        label: 'LSP',
        description: 'Use language-server code intelligence.',
        note: 'This only appears when the OpenCode LSP tool is enabled.',
    },
    {
        id: 'skill',
        permissionKey: 'skill',
        label: 'Skill',
        description: 'Load SKILL.md capability bundles into the conversation.',
    },
    {
        id: 'todowrite',
        permissionKey: 'todowrite',
        label: 'Todo',
        description: 'Maintain structured todo lists during long tasks.',
    },
    {
        id: 'webfetch',
        permissionKey: 'webfetch',
        label: 'Web Fetch',
        description: 'Fetch and read content from a specific URL.',
    },
    {
        id: 'websearch',
        permissionKey: 'websearch',
        label: 'Web Search',
        description: 'Search the web for current information.',
    },
    {
        id: 'question',
        permissionKey: 'question',
        label: 'Question',
        description: 'Ask the user structured questions during execution.',
    },
]

const MANAGED_PERMISSION_KEYS = Array.from(new Set(BUILTIN_TOOL_DEFINITIONS.map((tool) => tool.permissionKey)))

export function normalizeToolPermission(value: unknown): ToolPermissionMode {
    return typeof value === 'string' && KNOWN_PERMISSION_VALUES.has(value as ToolPermissionMode)
        ? value as ToolPermissionMode
        : 'allow'
}

export function createToolPermissionDraft(permissionConfig: unknown): Record<string, ToolPermissionMode> {
    const permissionRecord = permissionConfig && typeof permissionConfig === 'object'
        ? permissionConfig as Record<string, unknown>
        : {}

    return Object.fromEntries(
        MANAGED_PERMISSION_KEYS.map((permissionKey) => [permissionKey, normalizeToolPermission(permissionRecord[permissionKey])]),
    )
}

export function mergeToolPermissionConfig(
    currentPermissionConfig: unknown,
    draft: Record<string, ToolPermissionMode>,
): Record<string, unknown> {
    const current = currentPermissionConfig && typeof currentPermissionConfig === 'object'
        ? currentPermissionConfig as Record<string, unknown>
        : {}

    const preserved = Object.fromEntries(
        Object.entries(current).filter(([permissionKey]) => !MANAGED_PERMISSION_KEYS.includes(permissionKey)),
    )

    return {
        ...preserved,
        ...Object.fromEntries(
            MANAGED_PERMISSION_KEYS.map((permissionKey) => [permissionKey, normalizeToolPermission(draft[permissionKey])]),
        ),
    }
}
