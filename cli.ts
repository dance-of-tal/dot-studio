#!/usr/bin/env node
// DOT Studio CLI — dot-studio [path] [options]

import fs from 'fs/promises'
import { resolve, basename, dirname, join } from 'path'
import net from 'net'
import os from 'os'
import { fileURLToPath } from 'url'
import { spawn, spawnSync } from 'child_process'
import readline from 'readline/promises'
import { resolvePackageBin } from './server/lib/package-bin.js'

type StudioPackageMeta = {
    name: string
    version: string
    engines?: {
        node?: string
    }
}

type OpenCommand = {
    kind: 'open'
    openBrowser: boolean
    projectDir: string
    port: number | null
    opencodeUrl: string | null
    verbose: boolean
}

type DoctorCommand = {
    kind: 'doctor'
    projectDir: string
    port: number
    opencodeUrl: string | null
    verbose: boolean
}

type HelpCommand = {
    kind: 'help'
}

type VersionCommand = {
    kind: 'version'
}

type CliCommand = OpenCommand | DoctorCommand | HelpCommand | VersionCommand

type DoctorCheck = {
    label: string
    status: 'ok' | 'warn' | 'fail' | 'info'
    detail: string
}

class CliUsageError extends Error {}

const DEFAULT_PORT = 3001
const MAX_PORT_SCAN = 20
const STATUS_PREFIX: Record<DoctorCheck['status'], string> = {
    ok: 'OK',
    warn: 'WARN',
    fail: 'FAIL',
    info: 'INFO',
}

function printUsage(packageMeta?: StudioPackageMeta) {
    const header = packageMeta ? `${packageMeta.name} ${packageMeta.version}` : 'dot-studio'
    console.log(`${header}

Usage:
  dot-studio [path] [options]
  dot-studio open [path] [options]
  dot-studio doctor [path] [options]
  dot-studio --help
  dot-studio --version

Commands:
  open                  Open a workspace. This is the default command.
  doctor                Check workspace, port, Node.js, and OpenCode readiness.

Arguments:
  path                  Workspace path to open or inspect. Defaults to the current directory.

Options:
  -p, --port <port>     Port for the Studio server. Defaults to 3001.
      --opencode-url <url>
                        Connect to an existing OpenCode instance instead of managed mode.
      --no-open         Do not open the browser window.
      --open            Explicitly open the browser window after startup.
      --verbose         Print extra startup details.
  -h, --help            Show this help message.
  -v, --version         Show the installed DOT Studio version.

Examples:
  dot-studio
  dot-studio .
  dot-studio ~/projects/dance-of-tal
  dot-studio open ~/projects/dance-of-tal --port 3010
  dot-studio doctor
  dot-studio doctor ~/projects/dance-of-tal --opencode-url http://localhost:4096`)
}

function failUsage(message: string): never {
    throw new CliUsageError(`${message}\nRun dot-studio --help for usage.`)
}

function parsePort(value: string | undefined, arg: string): number {
    if (!value) {
        failUsage(`Missing value for ${arg}`)
    }

    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        failUsage(`Invalid port: ${value}`)
    }

    return parsed
}

function parseCliArgs(argv: string[]): CliCommand {
    let command: CliCommand['kind'] = 'open'
    let commandExplicit = false
    let openBrowser = true
    let projectDir: string | null = null
    let port: number | null = null
    let opencodeUrl: string | null = null
    let verbose = false

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]

        if (arg === '--help' || arg === '-h' || arg === 'help') {
            return { kind: 'help' }
        }

        if (arg === '--version' || arg === '-v' || arg === 'version') {
            return { kind: 'version' }
        }

        if (!commandExplicit && (arg === 'open' || arg === 'doctor')) {
            command = arg
            commandExplicit = true
            continue
        }

        if (arg === '--no-open') {
            openBrowser = false
            continue
        }

        if (arg === '--open') {
            openBrowser = true
            continue
        }

        if (arg === '--verbose') {
            verbose = true
            continue
        }

        if (arg === '--opencode-url') {
            opencodeUrl = argv[index + 1] || null
            if (!opencodeUrl) {
                failUsage('Missing value for --opencode-url')
            }
            index += 1
            continue
        }

        if (arg === '--port' || arg === '-p') {
            port = parsePort(argv[index + 1], arg)
            index += 1
            continue
        }

        if (arg.startsWith('-')) {
            failUsage(`Unknown option: ${arg}`)
        }

        if (projectDir) {
            failUsage(`Unexpected extra argument: ${arg}`)
        }

        projectDir = arg
    }

    const resolvedProjectDir = resolve(projectDir || process.cwd())

    if (command === 'doctor') {
        return {
            kind: 'doctor',
            projectDir: resolvedProjectDir,
            port: port || Number.parseInt(process.env.PORT || '', 10) || DEFAULT_PORT,
            opencodeUrl: opencodeUrl || process.env.OPENCODE_URL || null,
            verbose,
        }
    }

    return {
        kind: 'open',
        openBrowser,
        projectDir: resolvedProjectDir,
        port,
        opencodeUrl: opencodeUrl || process.env.OPENCODE_URL || null,
        verbose,
    }
}

function canListenOnPort(port: number) {
    return new Promise<boolean>((resolvePromise) => {
        const server = net.createServer()
        server.once('error', () => {
            resolvePromise(false)
        })
        server.once('listening', () => {
            server.close(() => resolvePromise(true))
        })
        server.listen({
            port,
            host: '::',
            exclusive: true,
        })
    })
}

function compareSemver(left: string, right: string) {
    const normalize = (value: string) =>
        value
            .replace(/^v/, '')
            .split('-')[0]
            .split('.')
            .map((part) => Number.parseInt(part, 10) || 0)

    const leftParts = normalize(left)
    const rightParts = normalize(right)
    const length = Math.max(leftParts.length, rightParts.length)

    for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] || 0
        const rightValue = rightParts[index] || 0
        if (leftValue === rightValue) {
            continue
        }
        return leftValue - rightValue
    }

    return 0
}

function isNodeVersionSupported(range: string | undefined, version: string) {
    if (!range) {
        return true
    }

    const match = range.match(/^>=\s*([0-9][^ ]*)$/)
    if (!match) {
        return true
    }

    return compareSemver(version, match[1]) >= 0
}

async function readStudioPackageMeta(): Promise<StudioPackageMeta> {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)
    const searchRoots = basename(currentDir) === 'dist'
        ? [dirname(currentDir), currentDir]
        : [currentDir]

    for (const initialDir of searchRoots) {
        let searchDir = initialDir

        while (true) {
            const packageJsonPath = join(searchDir, 'package.json')

            try {
                const raw = await fs.readFile(packageJsonPath, 'utf-8')
                const parsed = JSON.parse(raw) as Partial<StudioPackageMeta>
                if (typeof parsed.name === 'string' && typeof parsed.version === 'string') {
                    return parsed as StudioPackageMeta
                }
            } catch {
                // Walk upward until we find the published package root.
            }

            const parentDir = dirname(searchDir)
            if (parentDir === searchDir) {
                break
            }
            searchDir = parentDir
        }
    }

    throw new Error('Could not locate package.json for DOT Studio.')
}

async function fetchLatestVersion(packageName: string) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
        headers: {
            accept: 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch npm metadata for ${packageName}.`)
    }

    const payload = await response.json() as { version?: string }
    return payload.version || null
}

const UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000

function getUpdateSnoozePath(packageName: string) {
    const safeName = packageName.replace(/[^a-z0-9-]/gi, '_')
    return join(os.tmpdir(), `.${safeName}-update-snooze`)
}

async function isUpdateSnoozed(packageName: string): Promise<boolean> {
    try {
        const raw = await fs.readFile(getUpdateSnoozePath(packageName), 'utf-8')
        const snoozedAt = Number.parseInt(raw.trim(), 10)
        return Number.isFinite(snoozedAt) && Date.now() - snoozedAt < UPDATE_SNOOZE_DURATION_MS
    } catch {
        return false
    }
}

async function snoozeUpdate(packageName: string) {
    try {
        await fs.writeFile(getUpdateSnoozePath(packageName), String(Date.now()), 'utf-8')
    } catch {
        // ignore write errors
    }
}

async function promptForNpmUpdate(packageMeta: StudioPackageMeta) {
    if (await isUpdateSnoozed(packageMeta.name)) {
        return false
    }

    let latestVersion: string | null = null

    try {
        latestVersion = await fetchLatestVersion(packageMeta.name)
    } catch {
        return false
    }

    if (!latestVersion || compareSemver(latestVersion, packageMeta.version) <= 0) {
        return false
    }

    const message = `A newer ${packageMeta.name} version is available on npm (${packageMeta.version} -> ${latestVersion}). Update now? [Y/n] `
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

    if (!isInteractive) {
        console.log(`${message.trim()} Run npm install -g ${packageMeta.name}@latest to update.`)
        return false
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    try {
        const answer = (await rl.question(message)).trim().toLowerCase()
        if (answer && answer !== 'y' && answer !== 'yes') {
            await snoozeUpdate(packageMeta.name)
            return false
        }
    } finally {
        rl.close()
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(npmCommand, ['install', '-g', `${packageMeta.name}@latest`], {
            stdio: 'inherit',
        })

        child.on('exit', (code) => {
            if (code === 0) {
                resolvePromise()
                return
            }
            reject(new Error(`npm install exited with code ${code ?? 1}.`))
        })
        child.on('error', reject)
    })

    console.log(`Updated ${packageMeta.name} to ${latestVersion}. Run dot-studio again to start the new version.`)
    return true
}

async function validateProjectDir(projectDir: string) {
    const stat = await fs.stat(projectDir).catch(() => null)
    if (!stat) {
        throw new Error(`Directory not found: ${projectDir}`)
    }
    if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${projectDir}`)
    }
}

async function resolveOpenPort(requestedPort: number | null) {
    const basePort = requestedPort || Number.parseInt(process.env.PORT || '', 10) || DEFAULT_PORT
    let resolvedPort = basePort

    if (requestedPort) {
        if (!(await canListenOnPort(requestedPort))) {
            throw new Error(`Port ${requestedPort} is already in use. Try a different port with --port.`)
        }
        return requestedPort
    }

    while (!(await canListenOnPort(resolvedPort))) {
        resolvedPort += 1
        if (resolvedPort - basePort > MAX_PORT_SCAN) {
            throw new Error(`Could not find an open port starting from ${basePort}. Try --port with a free port.`)
        }
    }

    return resolvedPort
}

function findCommandInPath(command: string) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
    const result = spawnSync(lookupCommand, [command], { encoding: 'utf-8' })
    if (result.status !== 0) {
        return null
    }

    const output = result.stdout.trim().split(/\r?\n/).find(Boolean)
    return output || null
}

function resolveOpencodeExecutable() {
    return resolvePackageBin('opencode-ai', 'opencode') || findCommandInPath('opencode')
}

async function checkOpencodeReachable(url: string) {
    try {
        const target = new URL('/project', url)
        target.searchParams.set('directory', process.cwd())
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 1_500)
        try {
            const response = await fetch(target.toString(), { signal: controller.signal })
            return response.ok
        } finally {
            clearTimeout(timeout)
        }
    } catch {
        return false
    }
}

async function runDoctor(command: DoctorCommand, packageMeta: StudioPackageMeta) {
    const checks: DoctorCheck[] = []
    const nodeRange = packageMeta.engines?.node
    const nodeSupported = isNodeVersionSupported(nodeRange, process.version)
    checks.push({
        label: 'CLI',
        status: 'ok',
        detail: `${packageMeta.name} ${packageMeta.version}`,
    })
    checks.push({
        label: 'Node.js',
        status: nodeSupported ? 'ok' : 'fail',
        detail: nodeRange ? `${process.version} (requires ${nodeRange})` : process.version,
    })

    const projectStat = await fs.stat(command.projectDir).catch(() => null)
    if (!projectStat) {
        checks.push({
            label: 'Workspace path',
            status: 'fail',
            detail: `Directory not found: ${command.projectDir}`,
        })
    } else if (!projectStat.isDirectory()) {
        checks.push({
            label: 'Workspace path',
            status: 'fail',
            detail: `Not a directory: ${command.projectDir}`,
        })
    } else {
        checks.push({
            label: 'Workspace path',
            status: 'ok',
            detail: command.projectDir,
        })
        checks.push({
            label: 'Workspace init',
            status: 'info',
            detail: 'Workspace metadata will be initialized automatically when you open it.',
        })
    }

    const portAvailable = await canListenOnPort(command.port)
    checks.push({
        label: 'Studio port',
        status: portAvailable ? 'ok' : 'warn',
        detail: portAvailable
            ? `Port ${command.port} is available`
            : `Port ${command.port} is in use. dot-studio can use another port unless you force --port.`,
    })

    if (command.opencodeUrl) {
        let parsedUrl: URL | null = null
        try {
            parsedUrl = new URL(command.opencodeUrl)
        } catch {
            parsedUrl = null
        }

        if (!parsedUrl) {
            checks.push({
                label: 'OpenCode',
                status: 'fail',
                detail: `Invalid --opencode-url: ${command.opencodeUrl}`,
            })
        } else {
            const reachable = await checkOpencodeReachable(parsedUrl.toString())
            checks.push({
                label: 'OpenCode',
                status: reachable ? 'ok' : 'fail',
                detail: reachable
                    ? `External OpenCode reachable at ${parsedUrl.toString()}`
                    : `External OpenCode is not reachable at ${parsedUrl.toString()}`,
            })
        }
    } else {
        const executable = resolveOpencodeExecutable()
        checks.push({
            label: 'OpenCode',
            status: executable ? 'ok' : 'fail',
            detail: executable
                ? `Managed mode can start OpenCode via ${executable}`
                : 'Could not find an OpenCode executable. Install opencode-ai or provide --opencode-url.',
        })
    }

    console.log('DOT Studio doctor\n')
    for (const check of checks) {
        console.log(`${STATUS_PREFIX[check.status].padEnd(4)} ${check.label}: ${check.detail}`)
    }

    if (command.verbose) {
        console.log('\nEnvironment:')
        console.log(`  cwd: ${process.cwd()}`)
        console.log(`  platform: ${process.platform}`)
        console.log(`  arch: ${process.arch}`)
    }

    const hasFailure = checks.some((check) => check.status === 'fail')
    process.exit(hasFailure ? 1 : 0)
}

async function runOpen(command: OpenCommand, packageMeta: StudioPackageMeta) {
    const updated = await promptForNpmUpdate(packageMeta)
    if (updated) {
        process.exit(0)
    }

    await validateProjectDir(command.projectDir)
    const resolvedPort = await resolveOpenPort(command.port)

    const { ensureDotDir } = await import('./server/lib/dot-source.js')
    await ensureDotDir(command.projectDir)

    process.env.PROJECT_DIR = command.projectDir
    process.env.DOT_STUDIO_PRODUCTION = '1'
    process.env.PORT = String(resolvedPort)
    if (command.opencodeUrl) {
        process.env.OPENCODE_URL = command.opencodeUrl
    } else {
        delete process.env.OPENCODE_URL
    }

    const studioUrl = `http://localhost:${resolvedPort}`

    if (command.verbose) {
        console.log(`Opening DOT Studio for ${command.projectDir}`)
        if (command.opencodeUrl) {
            console.log(`Using external OpenCode at ${command.opencodeUrl}`)
        } else {
            console.log('Using managed OpenCode mode')
        }
    }

    await import('./server/index.js')

    console.log(`DOT Studio running at ${studioUrl}`)
    console.log(`Workspace: ${command.projectDir}`)
    if (command.openBrowser) {
        const open = await import('open')
        await open.default(studioUrl)
    }
}

const main = async () => {
    try {
        const parsed = parseCliArgs(process.argv.slice(2))
        const packageMeta = await readStudioPackageMeta()

        if (parsed.kind === 'help') {
            printUsage(packageMeta)
            return
        }

        if (parsed.kind === 'version') {
            console.log(packageMeta.version)
            return
        }

        if (parsed.kind === 'doctor') {
            await runDoctor(parsed, packageMeta)
            return
        }

        await runOpen(parsed, packageMeta)
    } catch (error) {
        if (error instanceof CliUsageError) {
            console.error(error.message)
            process.exit(1)
        }

        console.error('Failed to start DOT Studio:', error)
        process.exit(1)
    }
}

void main()
