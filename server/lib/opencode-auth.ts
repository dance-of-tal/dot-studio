import fs from 'fs/promises'
import os from 'os'
import path from 'path'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function authStoreCandidates() {
    const home = os.homedir()
    const candidates = [
        process.env.OPENCODE_AUTH_PATH,
        process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json') : null,
        path.join(home, '.local', 'share', 'opencode', 'auth.json'),
        path.join(home, 'Library', 'Application Support', 'opencode', 'auth.json'),
        path.join(home, 'AppData', 'Local', 'opencode', 'auth.json'),
    ]

    return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

async function resolveAuthStorePath() {
    for (const candidate of authStoreCandidates()) {
        try {
            await fs.access(candidate)
            return candidate
        } catch {
            continue
        }
    }

    return authStoreCandidates()[0]
}

export async function readStoredProviderAuthType(providerId: string): Promise<string | null> {
    const authPath = await resolveAuthStorePath()
    if (!authPath) {
        return null
    }

    try {
        const raw = await fs.readFile(authPath, 'utf-8')
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const normalized = providerId.replace(/\/+$/, '')
        const entry = parsed[providerId] || parsed[normalized] || parsed[`${normalized}/`]
        if (!entry || typeof entry !== 'object') {
            return null
        }
        const type = (entry as Record<string, unknown>).type
        return typeof type === 'string' && type.trim() ? type.trim() : null
    } catch {
        return null
    }
}

export async function clearStoredProviderAuth(providerId: string) {
    const authPath = await resolveAuthStorePath()
    if (!authPath) {
        return false
    }

    let current: Record<string, unknown> = {}
    try {
        const raw = await fs.readFile(authPath, 'utf-8')
        current = JSON.parse(raw)
    } catch (error: unknown) {
        if (!isErrnoException(error) || error.code !== 'ENOENT') {
            throw error
        }
    }

    const normalized = providerId.replace(/\/+$/, '')
    delete current[providerId]
    delete current[normalized]
    delete current[`${normalized}/`]

    await fs.mkdir(path.dirname(authPath), { recursive: true })
    await fs.writeFile(authPath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
    return true
}
