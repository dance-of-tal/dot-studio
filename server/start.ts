import { spawn, type ChildProcess } from 'node:child_process'

const OPENCODE_URL = 'http://127.0.0.1:4096'
const SERVER_URL = 'http://127.0.0.1:3001/api/health'
const STARTUP_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 250
const SHUTDOWN_TIMEOUT_MS = 5_000

type ManagedProcess = {
    name: string
    child: ChildProcess
}

const managedProcesses: ManagedProcess[] = []
let shuttingDown = false

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

function describeExit(code: number | null, signal: NodeJS.Signals | null) {
    if (signal) {
        return `signal ${signal}`
    }
    return `code ${code ?? 'unknown'}`
}

function waitForExit(child: ChildProcess) {
    return new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
            resolve()
            return
        }
        child.once('exit', () => resolve())
    })
}

async function stopAll(exitCode: number) {
    if (shuttingDown) {
        return
    }
    shuttingDown = true

    for (const { child } of managedProcesses) {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
        }
    }

    const forcedKill = setTimeout(() => {
        for (const { child } of managedProcesses) {
            if (child.exitCode === null) {
                child.kill('SIGKILL')
            }
        }
    }, SHUTDOWN_TIMEOUT_MS)
    forcedKill.unref()

    await Promise.allSettled(managedProcesses.map(({ child }) => waitForExit(child)))
    process.exit(exitCode)
}

function spawnManaged(name: string, command: string, extraEnv: NodeJS.ProcessEnv = {}) {
    const child = spawn(command, {
        shell: true,
        stdio: 'inherit',
        env: {
            ...process.env,
            ...extraEnv,
        },
    })

    managedProcesses.push({ name, child })

    child.once('error', (error) => {
        if (shuttingDown) {
            return
        }
        console.error(`[dev:all] ${name} failed to start:`, error)
        void stopAll(1)
    })

    child.once('exit', (code, signal) => {
        if (shuttingDown) {
            return
        }
        console.error(`[dev:all] ${name} exited with ${describeExit(code, signal)}`)
        void stopAll(code === 0 ? 0 : 1)
    })

    return child
}

async function waitForHttpOk(name: string, url: string, timeoutMs = STARTUP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs
    let lastFailure = 'no response'

    while (Date.now() < deadline) {
        try {
            const response = await fetch(url)
            if (response.ok) {
                return
            }
            lastFailure = `HTTP ${response.status}`
        } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error)
        }

        await sleep(POLL_INTERVAL_MS)
    }

    throw new Error(`${name} did not become ready in time (${lastFailure})`)
}

async function main() {
    process.on('SIGINT', () => {
        void stopAll(0)
    })
    process.on('SIGTERM', () => {
        void stopAll(0)
    })

    console.log('[dev:all] Starting OpenCode server on 4096...')
    spawnManaged('opencode', 'opencode serve --port 4096')
    await waitForHttpOk('OpenCode', `${OPENCODE_URL}/project?directory=${encodeURIComponent(process.cwd())}`)

    console.log('[dev:all] OpenCode is ready. Starting Hono server on 3001...')
    spawnManaged('server', 'tsx --watch server/index.ts', { OPENCODE_URL })
    await waitForHttpOk('Hono server', SERVER_URL)

    console.log('[dev:all] Hono server is ready. Starting Vite on 5173...')
    spawnManaged('vite', 'vite')

    await new Promise<void>(() => {})
}

main().catch((error) => {
    console.error('[dev:all] Startup failed:', error)
    void stopAll(1)
})
