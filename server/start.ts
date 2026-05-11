import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { STUDIO_API_PORT, STUDIO_OPENCODE_PORT, STUDIO_VITE_PORT } from '../shared/default-ports.js'
import { resolvePackageBinCommand } from './lib/package-bin.js'

const SERVER_URL = `http://127.0.0.1:${STUDIO_API_PORT}/api/health`
const OPENCODE_HEALTH_URL = `http://127.0.0.1:${STUDIO_API_PORT}/api/opencode/health`
const STARTUP_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 250
const SHUTDOWN_TIMEOUT_MS = 5_000
const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ManagedProcess = {
    name: string
    child: ChildProcess
}

type CommandSpec = {
    command: string
    args: string[]
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

function terminateProcessTree(child: ChildProcess, force = false) {
    if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', [
            '/PID',
            String(child.pid),
            '/T',
            ...(force ? ['/F'] : []),
        ], {
            stdio: 'ignore',
        }).once('error', () => {
            child.kill(force ? 'SIGKILL' : 'SIGTERM')
        })
        return
    }

    child.kill(force ? 'SIGKILL' : 'SIGTERM')
}

async function stopAll(exitCode: number) {
    if (shuttingDown) {
        return
    }
    shuttingDown = true

    for (const { child } of managedProcesses) {
        if (child.exitCode === null) {
            terminateProcessTree(child)
        }
    }

    const forcedKill = setTimeout(() => {
        for (const { child } of managedProcesses) {
            if (child.exitCode === null) {
                terminateProcessTree(child, true)
            }
        }
    }, SHUTDOWN_TIMEOUT_MS)
    forcedKill.unref()

    await Promise.allSettled(managedProcesses.map(({ child }) => waitForExit(child)))
    process.exit(exitCode)
}

function buildDevEnv(extraEnv: NodeJS.ProcessEnv = {}) {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...extraEnv,
        DOT_STUDIO_PRODUCTION: '0',
        PORT: String(STUDIO_API_PORT),
        OPENCODE_PORT: String(STUDIO_OPENCODE_PORT),
    }
    delete env.OPENCODE_URL
    return env
}

function resolvePackageCommand(packageName: string, binName: string, fallbackCommand: string): CommandSpec {
    return resolvePackageBinCommand(packageName, binName) || { command: fallbackCommand, args: [] }
}

function resolveDotDevAliasRegisterPath() {
    const candidates = [
        path.join(__dirname, 'lib', 'dot-dev-alias-register.mjs'),
        path.resolve(process.cwd(), 'server', 'lib', 'dot-dev-alias-register.mjs'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function withNodeImport(commandSpec: CommandSpec, importPath: string | null): CommandSpec {
    if (!importPath || commandSpec.command !== process.execPath) {
        return commandSpec
    }
    const importUrl = path.isAbsolute(importPath) ? pathToFileURL(importPath).href : importPath
    return {
        command: commandSpec.command,
        args: ['--import', importUrl, ...commandSpec.args],
    }
}

function spawnManaged(name: string, commandSpec: CommandSpec, extraArgs: string[] = [], extraEnv: NodeJS.ProcessEnv = {}) {
    const child = spawn(commandSpec.command, [...commandSpec.args, ...extraArgs], {
        shell: false,
        stdio: 'inherit',
        env: buildDevEnv(extraEnv),
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

    console.log(`[dev:all] Starting Hono server on ${STUDIO_API_PORT}...`)
    spawnManaged(
        'server',
        withNodeImport(resolvePackageCommand('tsx', 'tsx', 'tsx'), resolveDotDevAliasRegisterPath()),
        ['--watch', 'server/index.ts'],
    )
    await waitForHttpOk('Hono server', SERVER_URL)

    console.log('[dev:all] Hono server is ready. Waiting for managed OpenCode sidecar...')
    await waitForHttpOk(
        'Managed OpenCode',
        `${OPENCODE_HEALTH_URL}?workingDir=${encodeURIComponent(process.cwd())}`,
    )

    console.log(`[dev:all] Hono server is ready. Starting Vite on ${STUDIO_VITE_PORT}...`)
    spawnManaged('vite', resolvePackageCommand('vite', 'vite', 'vite'))

    await new Promise<void>(() => {})
}

main().catch((error) => {
    console.error('[dev:all] Startup failed:', error)
    void stopAll(1)
})
