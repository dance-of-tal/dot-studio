import fs from 'node:fs'
import path from 'node:path'
import * as pty from '@lydell/node-pty'
import type { IDisposable, IPty } from '@lydell/node-pty'
import { readGlobalConfigFile } from '../lib/global-config.js'

export interface TerminalSessionSummary {
    id: string
    title: string
    connected: boolean
}

export interface TerminalShellOption {
    path: string
    name: string
    acceptable: boolean
}

export interface TerminalSocket {
    readyState: number
    send(data: string | Uint8Array | ArrayBuffer): void
    close(code?: number, reason?: string): void
}

export interface TerminalOpenOptions {
    action: 'create' | 'attach'
    cwd: string
    targetId?: string
}

type TerminalProcess = Pick<IPty, 'pid' | 'onData' | 'onExit' | 'resize' | 'write' | 'kill'>

type TerminalProcessFactoryInput = {
    command: string
    args: string[]
    cwd: string
    env: Record<string, string | undefined>
    cols: number
    rows: number
}

type TerminalProcessFactory = (input: TerminalProcessFactoryInput) => TerminalProcess

type ShellResolver = () => Promise<{ command: string; args: string[] }>

interface TerminalManagerOptions {
    createProcess?: TerminalProcessFactory
    resolveShell?: ShellResolver
}

interface TerminalSession {
    id: string
    title: string
    cwd: string
    process: TerminalProcess
    pid: number
    clients: Set<TerminalConnection>
    buffer: string
    dataDisposable: IDisposable
    exitDisposable: IDisposable
    closing: boolean
}

const MAX_BUFFER_BYTES = 1024 * 1024 * 2
const TERMINAL_COLUMNS = 120
const TERMINAL_ROWS = 32
const SOCKET_OPEN = 1

let sessionCounter = 0

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

function normalizeAction(value: string | null | undefined): 'create' | 'attach' {
    return value === 'attach' ? 'attach' : 'create'
}

function shellName(shellPath: string) {
    return path.basename(shellPath) || shellPath
}

function isExecutable(filePath: string) {
    try {
        fs.accessSync(filePath, fs.constants.X_OK)
        return true
    } catch {
        return false
    }
}

function uniqueShellOptions(paths: string[]) {
    const seen = new Set<string>()
    return paths
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => {
            if (seen.has(entry)) return false
            seen.add(entry)
            return true
        })
        .map((entry) => ({
            path: entry,
            name: shellName(entry),
            acceptable: path.isAbsolute(entry) ? isExecutable(entry) : true,
        }))
}

export async function resolveTerminalShell(): Promise<{ command: string; args: string[] }> {
    const explicitShell = process.env.DOT_STUDIO_TERMINAL_SHELL?.trim()
    if (explicitShell) {
        return { command: explicitShell, args: process.platform === 'win32' ? [] : ['-l'] }
    }

    const config = await readGlobalConfigFile().catch(() => ({} as Record<string, unknown>))
    const configuredShell = typeof config.shell === 'string' ? config.shell.trim() : ''
    if (configuredShell) {
        return { command: configuredShell, args: process.platform === 'win32' ? [] : ['-l'] }
    }

    if (process.platform === 'win32') {
        return { command: process.env.ComSpec || 'cmd.exe', args: [] }
    }

    return { command: process.env.SHELL || '/bin/zsh', args: ['-l'] }
}

export async function listStudioTerminalShells(): Promise<TerminalShellOption[]> {
    if (process.platform === 'win32') {
        return uniqueShellOptions([
            process.env.ComSpec || 'cmd.exe',
            'powershell.exe',
            'pwsh.exe',
        ])
    }

    const candidates: string[] = []
    if (process.env.SHELL) {
        candidates.push(process.env.SHELL)
    }

    try {
        const shellFile = fs.readFileSync('/etc/shells', 'utf8')
        for (const line of shellFile.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#')) {
                candidates.push(trimmed)
            }
        }
    } catch {
        // /etc/shells is not guaranteed in minimal environments.
    }

    candidates.push('/bin/zsh', '/bin/bash', '/bin/sh')
    return uniqueShellOptions(candidates)
}

export class TerminalConnection {
    private sessionId: string | null = null
    private readonly manager: TerminalManager
    readonly socket: TerminalSocket
    readonly cwd: string

    constructor(
        manager: TerminalManager,
        socket: TerminalSocket,
        cwd: string,
    ) {
        this.manager = manager
        this.socket = socket
        this.cwd = cwd
    }

    get currentSessionId() {
        return this.sessionId
    }

    setSession(sessionId: string | null) {
        this.sessionId = sessionId
    }

    send(payload: Record<string, unknown>) {
        if (this.socket.readyState !== SOCKET_OPEN) return
        try {
            this.socket.send(JSON.stringify(payload))
        } catch {
            this.close()
        }
    }

    sendOutput(data: string) {
        this.send({ type: 'output', data })
    }

    handleMessage(raw: string) {
        this.manager.handleClientMessage(this, raw)
    }

    close() {
        this.manager.detachConnection(this)
    }
}

export class TerminalManager {
    private readonly sessions = new Map<string, TerminalSession>()
    private readonly connections = new Set<TerminalConnection>()
    private readonly createProcess: TerminalProcessFactory
    private readonly resolveShell: ShellResolver

    constructor(options: TerminalManagerOptions = {}) {
        this.createProcess = options.createProcess || ((input) => pty.spawn(input.command, input.args, {
            name: 'xterm-256color',
            cwd: input.cwd,
            env: input.env,
            cols: input.cols,
            rows: input.rows,
        }))
        this.resolveShell = options.resolveShell || resolveTerminalShell
    }

    normalizeOpenOptions(input: {
        action?: string | null
        cwd: string
        targetId?: string | null
    }): TerminalOpenOptions {
        return {
            action: normalizeAction(input.action),
            cwd: input.cwd,
            ...(input.targetId ? { targetId: input.targetId } : {}),
        }
    }

    async open(socket: TerminalSocket, options: TerminalOpenOptions): Promise<TerminalConnection> {
        const connection = new TerminalConnection(this, socket, options.cwd)
        this.connections.add(connection)

        const targetSession = options.targetId ? this.sessions.get(options.targetId) : null
        if (options.action === 'attach' && targetSession && targetSession.cwd === options.cwd) {
            this.attachConnection(connection, targetSession, 'attached')
            return connection
        }

        try {
            await this.createAndAttach(connection, options.cwd)
            return connection
        } catch (error) {
            this.connections.delete(connection)
            throw error
        }
    }

    listSessions(cwd: string): TerminalSessionSummary[] {
        return Array.from(this.sessions.values())
            .filter((session) => session.cwd === cwd)
            .map((session) => ({
                id: session.id,
                title: session.title,
                connected: Array.from(session.clients).some((client) => client.socket.readyState === SOCKET_OPEN),
            }))
    }

    handleClientMessage(connection: TerminalConnection, raw: string) {
        const parsed = safeJsonParse<Record<string, unknown>>(raw)
        if (!parsed) {
            this.writeToConnectionSession(connection, raw)
            return
        }

        switch (parsed.type) {
            case 'input':
                if (typeof parsed.data === 'string') {
                    this.writeToConnectionSession(connection, parsed.data)
                }
                break
            case 'resize':
                this.resizeConnectionSession(connection, parsed.cols, parsed.rows)
                break
            case 'create':
                void this.createAndAttach(
                    connection,
                    typeof parsed.cwd === 'string' && parsed.cwd.trim()
                        ? parsed.cwd
                        : connection.cwd,
                ).catch((error) => {
                    connection.send({ type: 'error', message: `Failed: ${errorMessage(error)}` })
                })
                break
            case 'kill':
                if (typeof parsed.id === 'string') {
                    this.killSession(parsed.id, connection.cwd)
                }
                break
            case 'rename':
                if (typeof parsed.id === 'string' && typeof parsed.title === 'string') {
                    this.renameSession(parsed.id, connection.cwd, parsed.title)
                }
                break
            case 'list':
                connection.send({ type: 'sessions', sessions: this.listSessions(connection.cwd) })
                break
        }
    }

    detachConnection(connection: TerminalConnection) {
        this.connections.delete(connection)
        const session = connection.currentSessionId ? this.sessions.get(connection.currentSessionId) : null
        if (session) {
            session.clients.delete(connection)
            this.broadcastSessionList(session.cwd)
        }
        connection.setSession(null)
    }

    disposeAll() {
        for (const connection of Array.from(this.connections)) {
            try {
                connection.socket.close()
            } catch {
                // Shutdown should continue even if a browser socket is already gone.
            }
            connection.setSession(null)
        }
        this.connections.clear()

        for (const session of Array.from(this.sessions.values())) {
            this.removeSession(session, { notifyExit: false, kill: true })
        }
        this.sessions.clear()
    }

    private async createAndAttach(connection: TerminalConnection, cwd: string) {
        const session = await this.createSession(cwd)
        this.attachConnection(connection, session, 'connected')
        this.broadcastSessionList(cwd)
    }

    private async createSession(cwd: string): Promise<TerminalSession> {
        sessionCounter += 1
        const id = `term-${sessionCounter}`
        const title = `Terminal ${sessionCounter}`
        const shell = await this.resolveShell()
        const env = {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            DOT_STUDIO_TERMINAL: '1',
        }

        const proc = this.createProcess({
            command: shell.command,
            args: shell.args,
            cwd,
            env,
            cols: TERMINAL_COLUMNS,
            rows: TERMINAL_ROWS,
        })

        const session: TerminalSession = {
            id,
            title,
            cwd,
            process: proc,
            pid: proc.pid,
            clients: new Set(),
            buffer: '',
            dataDisposable: { dispose: () => {} },
            exitDisposable: { dispose: () => {} },
            closing: false,
        }

        session.dataDisposable = proc.onData((data) => {
            this.addToBuffer(session, data)
            for (const client of Array.from(session.clients)) {
                if (client.socket.readyState !== SOCKET_OPEN) {
                    session.clients.delete(client)
                    continue
                }
                client.sendOutput(data)
            }
        })

        session.exitDisposable = proc.onExit(({ exitCode }) => {
            this.removeSession(session, { notifyExit: true, exitCode })
        })

        this.sessions.set(id, session)
        return session
    }

    private attachConnection(connection: TerminalConnection, session: TerminalSession, type: 'connected' | 'attached') {
        const previous = connection.currentSessionId ? this.sessions.get(connection.currentSessionId) : null
        if (previous) {
            previous.clients.delete(connection)
        }

        session.clients.add(connection)
        connection.setSession(session.id)

        if (session.buffer) {
            connection.sendOutput(session.buffer)
        }

        connection.send({
            type,
            id: session.id,
            title: session.title,
            cwd: session.cwd,
            pid: session.pid,
            sessions: this.listSessions(session.cwd),
        })
        this.broadcastSessionList(session.cwd)
    }

    private writeToConnectionSession(connection: TerminalConnection, data: string) {
        const session = connection.currentSessionId ? this.sessions.get(connection.currentSessionId) : null
        if (!session || session.closing) return
        try {
            session.process.write(data)
        } catch (error) {
            connection.send({ type: 'error', message: `Write failed: ${errorMessage(error)}` })
        }
    }

    private resizeConnectionSession(connection: TerminalConnection, cols: unknown, rows: unknown) {
        const session = connection.currentSessionId ? this.sessions.get(connection.currentSessionId) : null
        if (!session || session.closing) return
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return
        try {
            session.process.resize(Number(cols), Number(rows))
        } catch (error) {
            connection.send({ type: 'error', message: `Resize failed: ${errorMessage(error)}` })
        }
    }

    private killSession(id: string, cwd: string) {
        const session = this.sessions.get(id)
        if (!session || session.cwd !== cwd) return
        this.removeSession(session, { notifyExit: true, kill: true })
    }

    private renameSession(id: string, cwd: string, title: string) {
        const session = this.sessions.get(id)
        const normalizedTitle = title.trim()
        if (!session || session.cwd !== cwd || !normalizedTitle) return
        session.title = normalizedTitle
        this.broadcastSessionList(cwd)
    }

    private addToBuffer(session: TerminalSession, data: string) {
        session.buffer += data
        if (session.buffer.length > MAX_BUFFER_BYTES) {
            session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER_BYTES)
        }
    }

    private removeSession(
        session: TerminalSession,
        options: { notifyExit: boolean; exitCode?: number; kill?: boolean },
    ) {
        if (!this.sessions.has(session.id)) return
        session.closing = true
        this.sessions.delete(session.id)

        try {
            session.dataDisposable.dispose()
        } catch {
            // Listener cleanup is best-effort during terminal teardown.
        }
        try {
            session.exitDisposable.dispose()
        } catch {
            // Listener cleanup is best-effort during terminal teardown.
        }
        if (options.kill) {
            try {
                session.process.kill()
            } catch {
                // The PTY may already have exited by the time Studio cleans it up.
            }
        }

        for (const client of Array.from(session.clients)) {
            client.setSession(null)
            if (options.notifyExit) {
                client.send({ type: 'exit', id: session.id, exitCode: options.exitCode ?? null })
            }
        }
        session.clients.clear()
        this.broadcastSessionList(session.cwd)
    }

    private broadcastSessionList(cwd: string) {
        const sessions = this.listSessions(cwd)
        for (const connection of Array.from(this.connections)) {
            if (connection.cwd === cwd && connection.socket.readyState === SOCKET_OPEN) {
                connection.send({ type: 'sessions', sessions })
            }
        }
    }
}

function safeJsonParse<T>(raw: string): T | null {
    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export const terminalManager = new TerminalManager()
