import { getOpencode } from '../lib/opencode.js'
import { isSessionEffectivelyRunning, isSessionStatusActive } from '../lib/chat-session.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { clearProjectionRuntimePending } from './opencode-projection/projection-manifest.js'

type OpenCodeSessionSummary = {
    id?: string
} & Record<string, unknown>

type OpenCodeSessionStatus = {
    type?: 'idle' | 'busy' | 'retry' | 'error'
} & Record<string, unknown>

type OpenCodeSessionMessage = {
    info?: {
        role?: string
        error?: unknown
        time?: {
            completed?: number
        }
    }
    role?: string
    parts?: unknown[]
} & Record<string, unknown>

async function isSessionCountedAsRunning(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    directory: string,
    sessionId: string,
    status: OpenCodeSessionStatus | undefined,
) {
    if (!isSessionStatusActive(status)) {
        return false
    }

    try {
        const rawMessages = unwrapOpencodeResult<OpenCodeSessionMessage[]>(await oc.session.messages({
            directory,
            sessionID: sessionId,
        })) || []
        return isSessionEffectivelyRunning({ directStatus: status, messages: rawMessages })
    } catch {
        // If message inspection fails, fall back to the authoritative busy/retry status.
    }

    return true
}

export async function countRunningSessions(workingDir: string) {
    const oc = await getOpencode()
    const directories = [workingDir]

    let runningSessions = 0

    for (const directory of directories) {
        let sessions: OpenCodeSessionSummary[] = []
        let statuses: Record<string, OpenCodeSessionStatus> = {}

        try {
            sessions = unwrapOpencodeResult<OpenCodeSessionSummary[]>(await oc.session.list({ directory })) || []
        } catch {
            sessions = []
        }

        try {
            statuses = unwrapOpencodeResult<Record<string, OpenCodeSessionStatus>>(await oc.session.status({ directory })) || {}
        } catch {
            statuses = {}
        }

        for (const session of sessions) {
            if (!session?.id) {
                continue
            }
            const status = statuses?.[session.id]
            if (await isSessionCountedAsRunning(oc, directory, session.id, status)) {
                runningSessions += 1
            }
        }
    }

    return { oc, directories, runningSessions }
}

export async function applyStudioRuntimeReload(workingDir: string) {
    const { oc, directories, runningSessions } = await countRunningSessions(workingDir)

    if (runningSessions > 0) {
        return {
            applied: false,
            blocked: true,
            runningSessions,
            disposedDirectories: [] as string[],
        }
    }

    for (const directory of directories) {
        await oc.instance.dispose({ directory }).catch(() => {})
        await clearProjectionRuntimePending(directory).catch(() => {})
    }

    return {
        applied: true,
        blocked: false,
        runningSessions: 0,
        disposedDirectories: directories,
    }
}
