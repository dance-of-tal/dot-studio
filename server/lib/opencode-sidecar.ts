import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { DEFAULT_PROJECT_DIR, OPENCODE_MANAGED, OPENCODE_URL } from './config.js'
import { resolvePackageBin } from './package-bin.js'

const STARTUP_TIMEOUT_MS = 15_000
const HEALTHCHECK_INTERVAL_MS = 250
const REACHABILITY_CACHE_MS = 1_000

let child: ChildProcess | null = null
let startupPromise: Promise<void> | null = null
let reachabilityCache: { ok: boolean; checkedAt: number } | null = null

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolvePort(): number {
    try {
        const url = new URL(OPENCODE_URL)
        if (url.port) {
            return Number(url.port)
        }
        return url.protocol === 'https:' ? 443 : 80
    } catch {
        return 4096
    }
}

function resolveCommand(): string {
    return process.env.OPENCODE_BIN || resolvePackageBin('opencode-ai', 'opencode') || 'opencode'
}

export function isManagedOpencode(): boolean {
    return OPENCODE_MANAGED
}

export function canRestartOpencodeSidecar(): boolean {
    return !!child
}

export async function isOpencodeReachable(): Promise<boolean> {
    try {
        const url = new URL('/project', OPENCODE_URL)
        url.searchParams.set('directory', path.resolve(DEFAULT_PROJECT_DIR))
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 1_500)
        try {
            const response = await fetch(url.toString(), { signal: controller.signal })
            return response.ok
        } finally {
            clearTimeout(timeout)
        }
    } catch {
        return false
    }
}

async function getReachability(force = false) {
    if (!force && reachabilityCache && Date.now() - reachabilityCache.checkedAt < REACHABILITY_CACHE_MS) {
        return reachabilityCache.ok
    }

    const ok = await isOpencodeReachable()
    reachabilityCache = { ok, checkedAt: Date.now() }
    return ok
}

async function waitForReady() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
        if (await isOpencodeReachable()) {
            return
        }
        if (child && child.exitCode !== null) {
            break
        }
        await sleep(HEALTHCHECK_INTERVAL_MS)
    }

    throw new Error('OpenCode sidecar did not become ready in time.')
}

async function waitForShutdown() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
        if (!(await isOpencodeReachable())) {
            return
        }
        await sleep(HEALTHCHECK_INTERVAL_MS)
    }

    throw new Error('OpenCode sidecar did not stop in time.')
}

export async function ensureOpencodeSidecar(): Promise<void> {
    if (!isManagedOpencode()) {
        return
    }

    if (startupPromise) {
        return startupPromise
    }

    if (child && child.exitCode === null) {
        if (reachabilityCache?.ok) {
            return
        }
        if (await getReachability()) {
            return
        }
    }

    if (await getReachability()) {
        return
    }

    startupPromise = (async () => {
        if (await getReachability()) {
            return
        }

        const opencode = spawn(
            resolveCommand(),
            ['--port', String(resolvePort()), path.resolve(DEFAULT_PROJECT_DIR)],
            {
                cwd: path.resolve(DEFAULT_PROJECT_DIR),
                env: process.env,
                stdio: 'ignore',
            },
        )

        child = opencode
        opencode.once('exit', () => {
            if (child === opencode) {
                child = null
            }
            reachabilityCache = null
        })

        await waitForReady()
        reachabilityCache = { ok: true, checkedAt: Date.now() }
    })().finally(() => {
        startupPromise = null
    })

    return startupPromise
}

export async function restartOpencodeSidecar(): Promise<void> {
    if (!isManagedOpencode()) {
        throw new Error('OpenCode restart is only available in managed mode.')
    }

    if (!child) {
        if (await getReachability(true)) {
            throw new Error('Managed OpenCode restart is unavailable because the current daemon was not started by Studio.')
        }
        return ensureOpencodeSidecar()
    }

    const currentChild = child
    currentChild.kill('SIGTERM')
    await waitForShutdown().catch(async () => {
        currentChild.kill('SIGKILL')
        await waitForShutdown()
    })
    child = null
    reachabilityCache = null
    return ensureOpencodeSidecar()
}
