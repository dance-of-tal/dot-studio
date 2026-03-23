// Terminal WebSocket handler — proxies PTY sessions via OpenCode SDK v2 PTY API
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { OPENCODE_URL } from './lib/config.js';

interface TerminalSession {
    id: string;          // local Studio session id
    ptyID: string;       // OpenCode PTY id
    ws: WebSocket | null;
    title: string;
    buffer: string[];
    cwd: string;
    ptyWs: WebSocket | null; // WebSocket to OpenCode PTY
    initialized: boolean; // track whether initial prompt has arrived
}

const MAX_BUFFER = 500;
const sessions = new Map<string, TerminalSession>();
let sessionCounter = 0;

function errorMessage(error: unknown, fallback = 'Unknown error'): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function stripTerminalNoise(input: string): string {
    let result = '';

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        const code = char.charCodeAt(0);

        if (code === 27) {
            const next = input[index + 1];

            if (next === ']') {
                index += 2;
                while (index < input.length) {
                    const oscChar = input[index];
                    const oscCode = oscChar.charCodeAt(0);
                    if (oscCode === 7) {
                        break;
                    }
                    if (oscCode === 27 && input[index + 1] === '\\') {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
                continue;
            }

            if (next === '[') {
                index += 2;
                while (index < input.length) {
                    const csiCode = input[index].charCodeAt(0);
                    const isLetter = (csiCode >= 65 && csiCode <= 90) || (csiCode >= 97 && csiCode <= 122);
                    if (isLetter) {
                        break;
                    }
                    index += 1;
                }
                continue;
            }

            if (next) {
                index += 1;
            }
            continue;
        }

        if (char === '\r' || char === '\n') {
            continue;
        }

        result += char;
    }

    return result.trim();
}

async function opencodePtyRequest<T>(path: string, init: RequestInit, directory?: string): Promise<T> {
    const url = new URL(path, OPENCODE_URL);
    if (directory) {
        url.searchParams.set('directory', directory);
    }

    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });

    const raw = await res.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!res.ok) {
        const message = payload?.error?.message
            || payload?.error
            || payload?.data?.message
            || payload?.message
            || raw
            || `OpenCode PTY request failed (${res.status})`;
        throw new Error(String(message));
    }

    return payload as T;
}

export function setupTerminalWs(server: HttpServer, defaultCwd: string | (() => string)) {
    const wss = new WebSocketServer({ noServer: true });
    const resolveDefaultCwd = () => typeof defaultCwd === 'function' ? defaultCwd() : defaultCwd;

    server.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/ws/terminal')) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
    });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url || '', 'http://localhost');
        const action = url.searchParams.get('action') || 'create';
        const targetId = url.searchParams.get('id') || '';
        const cwd = url.searchParams.get('cwd') || resolveDefaultCwd();
        const targetSession = targetId ? sessions.get(targetId) : null;

        if (action === 'attach' && targetSession && targetSession.cwd === cwd) {
            attachSession(ws, targetId);
        } else {
            createSession(ws, cwd);
        }
    });

    async function createSession(ws: WebSocket, cwd: string) {
        sessionCounter++;
        const id = `term-${sessionCounter}`;
        const shell = process.env.SHELL || '/bin/zsh';
        const title = `Terminal ${sessionCounter}`;

        try {
            const ptyData = await opencodePtyRequest<{ id?: string }>('/pty', {
                method: 'POST',
                body: JSON.stringify({
                    command: shell,
                    args: ['-l'],
                    cwd,
                    title,
                    env: {
                        TERM: 'xterm-256color',
                        COLORTERM: 'truecolor',
                    },
                }),
            }, cwd)
            const ptyID = ptyData?.id;

            if (!ptyID) {
                throw new Error('Failed to create PTY session: no ID returned');
            }

            const session: TerminalSession = { id, ptyID, ws, title, buffer: [], cwd, ptyWs: null, initialized: false };
            sessions.set(id, session);

            // Connect to OpenCode PTY WebSocket for real-time I/O
            connectPtyWebSocket(session);

            ws.send(JSON.stringify({
                type: 'connected',
                id, title, shell, cwd,
                sessions: getSessionList(cwd),
            }));

            setupWsHandlers(ws, session);
            broadcastSessionList(session.cwd);
        } catch (error: unknown) {
            const message = errorMessage(error);
            console.error('Failed to create PTY via OpenCode:', message);
            ws.send(JSON.stringify({ type: 'error', message: `Failed: ${message}` }));
            ws.close();
        }
    }

    function connectPtyWebSocket(session: TerminalSession) {
        // Build OpenCode PTY WebSocket URL
        const baseUrl = OPENCODE_URL.replace(/^http/, 'ws');
        const ptyUrl = new URL(`/pty/${session.ptyID}/connect`, baseUrl);
        if (session.cwd) {
            ptyUrl.searchParams.set('directory', session.cwd);
        }
        const ptyWsUrl = ptyUrl.toString();

        const ptyWs = new WebSocket(ptyWsUrl);
        session.ptyWs = ptyWs;

        ptyWs.on('message', (rawData) => {
            const data = rawData.toString();

            // Filter initial noise like {"cursor":0}% that zsh/bash emit before the first prompt.
            // The data may arrive in multiple small chunks with ANSI sequences mixed in.
            if (!session.initialized) {
                // Strip ALL ANSI escape sequences (CSI, OSC, etc.)
                const stripped = stripTerminalNoise(data);
                // Skip if it's cursor control noise, percent signs, or empty after stripping
                if (!stripped || /\{"cursor":\d+\}/.test(stripped) || /^%+$/.test(stripped)) {
                    return;
                }
                session.initialized = true;
            }

            addToBuffer(session, data);
            if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(JSON.stringify({ type: 'output', data }));
            }
        });

        // Poll PTY status to detect exit (OpenCode PTY WS may not close immediately)
        const statusInterval = setInterval(async () => {
            if (!sessions.has(session.id)) {
                clearInterval(statusInterval);
                return;
            }
            try {
                const info = await opencodePtyRequest<{ status?: string }>(`/pty/${session.ptyID}`, {
                    method: 'GET',
                }, session.cwd);
                if (info?.status === 'exited') {
                    clearInterval(statusInterval);
                    handleSessionExit(session);
                }
            } catch {
                // PTY not found (404) means it already exited
                clearInterval(statusInterval);
                handleSessionExit(session);
            }
        }, 2000);

        ptyWs.on('close', () => {
            clearInterval(statusInterval);
            session.ptyWs = null;
            handleSessionExit(session);
        });

        ptyWs.on('error', (err) => {
            console.error(`PTY WebSocket error for ${session.id}:`, err.message);
        });
    }

    function handleSessionExit(session: TerminalSession) {
        if (!sessions.has(session.id)) return; // Already handled
        // Notify client that the session has exited
        if (session.ws?.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'exit', id: session.id }));
        }
        session.ptyWs?.close();
        session.ptyWs = null;
        sessions.delete(session.id);
        broadcastSessionList(session.cwd);
    }

    function attachSession(ws: WebSocket, targetId: string) {
        const session = sessions.get(targetId);
        if (!session) return;

        if (session.ws && session.ws !== ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.close();
        }
        session.ws = ws;

        // Replay buffer
        if (session.buffer.length > 0) {
            ws.send(JSON.stringify({ type: 'output', data: session.buffer.join('') }));
        }

        ws.send(JSON.stringify({
            type: 'attached',
            id: session.id,
            title: session.title,
            sessions: getSessionList(session.cwd),
        }));

        setupWsHandlers(ws, session);
    }

    function setupWsHandlers(ws: WebSocket, session: TerminalSession) {
        ws.on('message', async (msg) => {
            try {
                const parsed = JSON.parse(msg.toString());
                switch (parsed.type) {
                    case 'input':
                        // Forward input to OpenCode PTY WebSocket
                        if (session.ptyWs?.readyState === WebSocket.OPEN) {
                            session.ptyWs.send(parsed.data);
                        }
                        break;
                    case 'resize':
                        try {
                            await opencodePtyRequest(`/pty/${session.ptyID}`, {
                                method: 'PUT',
                                body: JSON.stringify({
                                    size: { rows: parsed.rows, cols: parsed.cols },
                                }),
                            }, session.cwd);
                        } catch (error: unknown) {
                            console.error('PTY resize failed:', errorMessage(error));
                        }
                        break;
                    case 'create':
                        createSession(ws, parsed.cwd || session.cwd || resolveDefaultCwd());
                        break;
                    case 'kill': {
                        const target = sessions.get(parsed.id);
                        if (target && target.cwd === session.cwd) {
                            try {
                                await opencodePtyRequest(`/pty/${target.ptyID}`, {
                                    method: 'DELETE',
                                }, target.cwd);
                            } catch { /* ignore */ }
                            target.ptyWs?.close();
                            sessions.delete(parsed.id);
                            broadcastSessionList(session.cwd);
                        }
                        break;
                    }
                    case 'rename': {
                        const target = sessions.get(parsed.id);
                        if (target && target.cwd === session.cwd && parsed.title) {
                            target.title = parsed.title;
                            broadcastSessionList(session.cwd);
                        }
                        break;
                    }
                    case 'list':
                        ws.send(JSON.stringify({ type: 'sessions', sessions: getSessionList(session.cwd) }));
                        break;
                }
            } catch {
                // Raw input fallback
                if (session.ptyWs?.readyState === WebSocket.OPEN) {
                    session.ptyWs.send(msg.toString());
                }
            }
        });

        ws.on('close', () => {
            if (session.ws === ws) session.ws = null;
        });
    }

    function addToBuffer(session: TerminalSession, data: string) {
        session.buffer.push(data);
        if (session.buffer.length > MAX_BUFFER) {
            session.buffer.splice(0, session.buffer.length - MAX_BUFFER);
        }
    }

    function getSessionList(cwd: string) {
        return Array.from(sessions.values())
            .filter((session) => session.cwd === cwd)
            .map(s => ({
                id: s.id,
                title: s.title,
                connected: s.ws !== null && s.ws.readyState === WebSocket.OPEN,
            }));
    }

    function broadcastSessionList(cwd: string) {
        const list = getSessionList(cwd);
        for (const s of sessions.values()) {
            if (s.cwd === cwd && s.ws?.readyState === WebSocket.OPEN) {
                s.ws.send(JSON.stringify({ type: 'sessions', sessions: list }));
            }
        }
    }

    console.log('   Terminal: WebSocket on /ws/terminal (via OpenCode PTY)');
}
