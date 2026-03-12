#!/usr/bin/env node
// DOT Studio CLI — npx dot-studio [projectDir] [--no-open]

import fs from 'fs/promises'
import { resolve, basename, dirname, join } from 'path'
import net from 'net'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import readline from 'readline/promises'

type StudioPackageMeta = {
    name: string
    version: string
}

function parseCliArgs(argv: string[]) {
    let openBrowser = true
    let projectDir: string | null = null
    let port: number | null = null

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--no-open') {
            openBrowser = false
            continue
        }

        if (arg === '--open') {
            openBrowser = true
            continue
        }

        if (arg === '--port' || arg === '-p') {
            const value = argv[index + 1]
            if (!value) {
                console.error(`Missing value for ${arg}`)
                process.exit(1)
            }
            const parsed = Number.parseInt(value, 10)
            if (!Number.isInteger(parsed) || parsed <= 0) {
                console.error(`Invalid port: ${value}`)
                process.exit(1)
            }
            port = parsed
            index += 1
            continue
        }

        if (arg.startsWith('-')) {
            console.error(`Unknown option: ${arg}`)
            process.exit(1)
        }

        if (projectDir) {
            console.error(`Unexpected extra argument: ${arg}`)
            process.exit(1)
        }

        projectDir = arg
    }

    return {
        openBrowser,
        projectDir: resolve(projectDir || process.cwd()),
        port,
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

async function readStudioPackageMeta(): Promise<StudioPackageMeta> {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)
    const packageRoot = basename(currentDir) === 'dist' ? dirname(currentDir) : currentDir
    const raw = await fs.readFile(join(packageRoot, 'package.json'), 'utf-8')
    return JSON.parse(raw) as StudioPackageMeta
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

async function promptForNpmUpdate(packageMeta: StudioPackageMeta) {
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

const startServer = async () => {
    try {
        const packageMeta = await readStudioPackageMeta()
        const updated = await promptForNpmUpdate(packageMeta)
        if (updated) {
            process.exit(0)
        }

        const { openBrowser, projectDir, port: requestedPort } = parseCliArgs(process.argv.slice(2))
        const basePort = requestedPort || Number.parseInt(process.env.PORT || '3001', 10) || 3001
        let resolvedPort = basePort

        if (requestedPort) {
            if (!(await canListenOnPort(requestedPort))) {
                console.error(`Port ${requestedPort} is already in use.`)
                process.exit(1)
            }
        } else {
            while (!(await canListenOnPort(resolvedPort))) {
                resolvedPort += 1
                if (resolvedPort - basePort > 20) {
                    console.error(`Could not find an open port starting from ${basePort}.`)
                    process.exit(1)
                }
            }
        }

        process.env.PROJECT_DIR = projectDir
        process.env.DOT_STUDIO_PRODUCTION = '1'
        process.env.PORT = String(resolvedPort)

        const studioUrl = `http://localhost:${resolvedPort}`

        // Dynamic import to let env vars take effect before config.ts loads
        await import('./server/index.js')

        console.log(`DOT Studio running at ${studioUrl}`)
        if (openBrowser) {
            const open = await import('open')
            await open.default(studioUrl)
        }
    } catch (err) {
        console.error('Failed to start DOT Studio:', err)
        process.exit(1)
    }
}

startServer()
