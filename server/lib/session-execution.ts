import fs from 'fs/promises'
import path from 'path'
import { STUDIO_DIR } from './config.js'
import type { ExecutionMode, SafeOwnerKind } from '../../shared/safe-mode.js'

export type SessionExecutionContext = {
    sessionId: string
    ownerKind: SafeOwnerKind
    ownerId: string
    mode: ExecutionMode
    workingDir: string
    executionDir: string
    updatedAt: number
}

type RegistryPayload = {
    version: 1
    sessions: Record<string, SessionExecutionContext>
}

const SESSION_EXECUTION_PATH = path.join(STUDIO_DIR, 'safe-mode', 'session-execution.json')
let sessionExecutionCache: RegistryPayload | null = null

async function readRegistry(): Promise<RegistryPayload> {
    if (sessionExecutionCache) {
        return sessionExecutionCache
    }

    try {
        const raw = await fs.readFile(SESSION_EXECUTION_PATH, 'utf-8')
        const parsed = JSON.parse(raw) as RegistryPayload
        sessionExecutionCache = {
            version: 1,
            sessions: parsed?.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
        }
        return sessionExecutionCache
    } catch {
        sessionExecutionCache = { version: 1, sessions: {} }
        return sessionExecutionCache
    }
}

async function writeRegistry(registry: RegistryPayload) {
    sessionExecutionCache = registry
    await fs.mkdir(path.dirname(SESSION_EXECUTION_PATH), { recursive: true })
    await fs.writeFile(SESSION_EXECUTION_PATH, JSON.stringify(registry, null, 2), 'utf-8')
}

export async function registerSessionExecutionContext(
    context: Omit<SessionExecutionContext, 'updatedAt'>,
) {
    const registry = await readRegistry()
    registry.sessions[context.sessionId] = {
        ...context,
        updatedAt: Date.now(),
    }
    await writeRegistry(registry)
}

export async function cloneSessionExecutionContext(
    sourceSessionId: string,
    targetSessionId: string,
) {
    const registry = await readRegistry()
    const source = registry.sessions[sourceSessionId]
    if (!source) {
        return null
    }
    registry.sessions[targetSessionId] = {
        ...source,
        sessionId: targetSessionId,
        updatedAt: Date.now(),
    }
    await writeRegistry(registry)
    return registry.sessions[targetSessionId]
}

export async function resolveSessionExecutionContext(sessionId: string) {
    const registry = await readRegistry()
    return registry.sessions[sessionId] || null
}

export async function unregisterSessionExecutionContext(sessionId: string) {
    const registry = await readRegistry()
    if (!(sessionId in registry.sessions)) {
        return
    }
    delete registry.sessions[sessionId]
    await writeRegistry(registry)
}

export async function listSessionExecutionContextsForWorkingDir(
    workingDir: string,
    ownerKind?: SafeOwnerKind,
) {
    const registry = await readRegistry()
    return Object.values(registry.sessions)
        .filter((context) => (
            context.workingDir === workingDir
            && (!ownerKind || context.ownerKind === ownerKind)
        ))
        .sort((left, right) => right.updatedAt - left.updatedAt)
}
