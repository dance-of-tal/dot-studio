import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { getOpencode } from '../lib/opencode.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { deleteSafeOwnerWorkspace } from '../lib/safe-mode.js'
import {
    listSessionExecutionContextsForWorkingDir,
    unregisterSessionExecutionContext,
} from '../lib/session-execution.js'
import { STUDIO_DIR, workspacesDir } from '../lib/config.js'

type WorkspaceSessionSummary = { id?: string }
type WorkspaceLinkedSnapshot = {
    workingDir?: string
    hiddenFromList?: boolean
    performers?: Array<{ id?: string }>
    acts?: Array<{ id?: string }>
} & Record<string, unknown>

function isAllowedWorkspaceCharacter(char: string) {
    const code = char.charCodeAt(0)
    return !('/\\:*?"<>|'.includes(char) || code < 32)
}

function sanitizeWorkspaceId(id: string): string {
    return id
        .replace(/\.\./g, '')
        .split('')
        .filter((char) => isAllowedWorkspaceCharacter(char))
        .join('')
        .trim()
}

function validateWorkspaceId(id: string): string | null {
    const clean = sanitizeWorkspaceId(id)
    if (!clean || clean.length === 0) return null
    if (clean.length > 128) return null
    return clean
}

function normalizeWorkingDir(input: string): string | null {
    const trimmed = input.trim().replace(/\/+$/, '')
    if (!trimmed) return null
    return path.resolve(trimmed)
}

function workspaceIdForWorkingDir(workingDir: string): string {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 16)
}

function workspacePathForId(id: string): string {
    return path.join(workspacesDir(), `${id}.json`)
}

async function purgeLinkedOpencodeData(workspace: WorkspaceLinkedSnapshot) {
    const workingDir = normalizeWorkingDir(workspace?.workingDir || '')
    if (!workingDir) {
        return
    }

    const executionContexts = await listSessionExecutionContextsForWorkingDir(workingDir)
    const directories = Array.from(new Set([
        workingDir,
        ...executionContexts.map((context) => context.executionDir),
    ]))
    const sessionDirectories = new Map<string, string>(
        executionContexts.map((context) => [context.sessionId, context.executionDir]),
    )

    try {
        const oc = await getOpencode()
        for (const directory of directories) {
            try {
                const sessions = unwrapOpencodeResult<WorkspaceSessionSummary[]>(await oc.session.list({ directory })) || []
                for (const session of sessions) {
                    if (session?.id && !sessionDirectories.has(session.id)) {
                        sessionDirectories.set(session.id, directory)
                    }
                }
            } catch (error) {
                console.warn('[workspace-service] Failed to list OpenCode sessions for workspace delete', { workingDir, directory, error })
            }
        }

        for (const [sessionId, directory] of Array.from(sessionDirectories.entries())) {
            try {
                unwrapOpencodeResult(await oc.session.delete({
                    sessionID: sessionId,
                    directory,
                }))
            } catch (error) {
                console.warn('[workspace-service] Failed to delete OpenCode session for workspace delete', { sessionId, directory, error })
            }
            await unregisterSessionExecutionContext(sessionId).catch(() => {})
        }
    } catch (error) {
        console.warn('[workspace-service] Failed to purge OpenCode data for workspace delete', { workingDir, error })
    }

    const ownerTargets = new Map<string, { ownerKind: 'performer' | 'act'; ownerId: string }>()
    for (const context of executionContexts) {
        ownerTargets.set(`${context.ownerKind}:${context.ownerId}`, {
            ownerKind: context.ownerKind,
            ownerId: context.ownerId,
        })
    }
    for (const performer of Array.isArray(workspace?.performers) ? workspace.performers : []) {
        if (typeof performer?.id === 'string' && performer.id) {
            ownerTargets.set(`performer:${performer.id}`, { ownerKind: 'performer', ownerId: performer.id })
        }
    }
    for (const act of Array.isArray(workspace?.acts) ? workspace.acts : []) {
        if (typeof act?.id === 'string' && act.id) {
            ownerTargets.set(`act:${act.id}`, { ownerKind: 'act', ownerId: act.id })
            await fs.rm(path.join(STUDIO_DIR, 'act-runtime', act.id), { recursive: true, force: true }).catch(() => {})
        }
    }

    for (const { ownerKind, ownerId } of Array.from(ownerTargets.values())) {
        await deleteSafeOwnerWorkspace(workingDir, ownerKind, ownerId).catch(() => {})
    }
}

export async function listSavedWorkspaces(includeHidden = false) {
    const dir = workspacesDir()
    await fs.mkdir(dir, { recursive: true })
    const files = await fs.readdir(dir)
    const entries = await Promise.all(
        files
            .filter((file) => file.endsWith('.json'))
            .map(async (file) => {
                const filePath = path.join(dir, file)
                try {
                    const [raw, stat] = await Promise.all([
                        fs.readFile(filePath, 'utf-8'),
                        fs.stat(filePath),
                    ])
                    const parsed = JSON.parse(raw)
                    const workingDir = normalizeWorkingDir(parsed.workingDir || '') || ''
                    if (!workingDir) {
                        return null
                    }
                    return {
                        id: file.replace('.json', ''),
                        workingDir,
                        updatedAt: stat.mtimeMs,
                        hiddenFromList: parsed.hiddenFromList === true,
                    }
                } catch {
                    return null
                }
            }),
    )

    return entries
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .filter((entry) => includeHidden || entry.hiddenFromList !== true)
        .map((entry) => ({
            id: entry.id,
            workingDir: entry.workingDir,
            updatedAt: entry.updatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getSavedWorkspace(rawId: string) {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    const filePath = workspacePathForId(id)
    if (!filePath.startsWith(workspacesDir())) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        return { ok: true as const, workspace: JSON.parse(raw) }
    } catch {
        return { ok: false as const, status: 404, error: 'Workspace not found' }
    }
}

export async function saveWorkspaceSnapshot(body: WorkspaceLinkedSnapshot) {
    const workingDir = normalizeWorkingDir(body.workingDir || '')
    if (!workingDir) {
        return { ok: false as const, status: 400, error: 'workingDir is required' }
    }

    const id = workspaceIdForWorkingDir(workingDir)
    const workspace = {
        ...body,
        workingDir,
        hiddenFromList: body.hiddenFromList === true,
    }
    const dir = workspacesDir()
    await fs.mkdir(dir, { recursive: true })

    const filePath = workspacePathForId(id)
    if (!filePath.startsWith(dir)) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    await fs.writeFile(filePath, JSON.stringify(workspace, null, 2), 'utf-8')
    const stat = await fs.stat(filePath)

    import('./studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(workingDir).catch(() => {}),
    )

    return {
        ok: true as const,
        id,
        workingDir,
        updatedAt: stat.mtimeMs,
    }
}

export async function setSavedWorkspaceHidden(rawId: string, hiddenFromList: boolean) {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    const filePath = workspacePathForId(id)
    if (!filePath.startsWith(workspacesDir())) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const workspace = JSON.parse(raw)
        workspace.hiddenFromList = hiddenFromList === true
        await fs.writeFile(filePath, JSON.stringify(workspace, null, 2), 'utf-8')
        return { ok: true as const, id, hiddenFromList: workspace.hiddenFromList }
    } catch {
        return { ok: false as const, status: 404, error: 'Workspace not found' }
    }
}

export async function deleteSavedWorkspace(rawId: string) {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    const filePath = workspacePathForId(id)
    if (!filePath.startsWith(workspacesDir())) {
        return { ok: false as const, status: 400, error: 'Invalid workspace id' }
    }

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const workspace = JSON.parse(raw)
        await purgeLinkedOpencodeData(workspace)
        await fs.unlink(filePath)
        return { ok: true as const }
    } catch {
        return { ok: false as const, status: 404, error: 'Workspace not found' }
    }
}
