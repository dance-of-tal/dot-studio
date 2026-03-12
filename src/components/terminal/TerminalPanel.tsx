import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import './TerminalPanel.css';
import { ChevronDown, X, Terminal as TerminalIcon, Plus } from 'lucide-react';
import { useStudioStore } from '../../store';

interface TermSession {
    id: string;
    title: string;
    connected: boolean;
}

interface TerminalPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    height: number;
    onHeightChange: (h: number) => void;
}

const termTheme = {
    background: '#000000',
    foreground: '#e0e0e0',
    cursor: '#a78bfa',
    selectionBackground: '#6366f140',
    black: '#000000',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e0e0e0',
    brightBlack: '#4a4a6a',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
};

function buildTerminalWebSocketUrl(action: 'create' | 'attach', workingDir: string | null, targetId?: string) {
    const url = new URL('/ws/terminal', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('action', action);
    if (targetId) {
        url.searchParams.set('id', targetId);
    }
    if (workingDir) {
        url.searchParams.set('cwd', workingDir);
    }
    return url.toString();
}

export default function TerminalPanel({ isOpen, onToggle, height, onHeightChange }: TerminalPanelProps) {
    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const resizingRef = useRef(false);
    const initializedRef = useRef(false);

    const [sessions, setSessions] = useState<TermSession[]>([]);
    const [activeId, setActiveId] = useState<string>('');
    const [editingTab, setEditingTab] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const workingDir = useStudioStore(s => s.workingDir);
    const lastWorkspaceRef = useRef(workingDir);
    const initialized = useRef(false); // tracks first real output

    // Connect or reconnect WebSocket
    const connect = useCallback((action: 'create' | 'attach' = 'create', targetId?: string) => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const ws = new WebSocket(buildTerminalWebSocketUrl(action, workingDir, targetId));
        wsRef.current = ws;

        ws.onopen = () => {
            initialized.current = false;
            if (xtermRef.current) {
                xtermRef.current.clear();
                xtermRef.current.reset();
            }
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                switch (msg.type) {
                    case 'output': {
                        // Filter initial noise like {"cursor":0}% from zsh
                        if (!initialized.current) {
                            const stripped = msg.data
                                .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
                                .replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '')
                                .replace(/\x1b[^[\]].?/g, '')
                                .replace(/[\r\n]/g, '')
                                .trim();
                            if (!stripped || /\{"cursor":\d+\}/.test(stripped) || /^%+$/.test(stripped)) {
                                break;
                            }
                            initialized.current = true;
                        }
                        xtermRef.current?.write(msg.data);
                        break;
                    }
                    case 'connected':
                    case 'attached':
                        setActiveId(msg.id);
                        if (msg.sessions) setSessions(msg.sessions);
                        setTimeout(() => {
                            fitRef.current?.fit();
                            if (xtermRef.current && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'resize',
                                    cols: xtermRef.current.cols,
                                    rows: xtermRef.current.rows,
                                }));
                            }
                        }, 100);
                        break;
                    case 'sessions':
                        setSessions(msg.sessions || []);
                        break;
                    case 'exit': {
                        // Process exited — remove this session's tab
                        const exitedId = msg.id || activeId;
                        setSessions(prev => prev.filter(s => s.id !== exitedId));
                        break;
                    }
                    case 'error':
                        xtermRef.current?.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
                        break;
                }
            } catch {
                // ignore
            }
        };

        ws.onclose = () => { };
    }, [workingDir]);

    useEffect(() => {
        if (!activeId) return;
        if (sessions.length === 0) {
            // No sessions left — close the terminal panel
            setActiveId('');
            onToggle();
            return;
        }
        const activeExists = sessions.some(s => s.id === activeId);
        if (!activeExists) {
            // Active session was removed — switch to first available
            const next = sessions[0];
            setActiveId(next.id);
            if (xtermRef.current) {
                xtermRef.current.clear();
                xtermRef.current.reset();
            }
            connect('attach', next.id);
        }
    }, [sessions, activeId, connect, onToggle]);

    // Initialize xterm once
    useEffect(() => {
        if (!isOpen || !termRef.current || initializedRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: '"Menlo", monospace',
            lineHeight: 1.2,
            letterSpacing: 0,
            theme: termTheme,
            allowProposedApi: true,
            allowTransparency: false,
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(termRef.current);
        try {
            term.loadAddon(new WebglAddon());
        } catch (e) {
            console.warn('[terminal] WebGL addon failed, falling back to canvas renderer', e);
        }
        fit.fit();

        xtermRef.current = term;
        fitRef.current = fit;
        initializedRef.current = true;

        term.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
        });

        connect('create');

        return () => { };
    }, [isOpen, connect]);

    // Fit when height changes
    useEffect(() => {
        if (isOpen && fitRef.current && xtermRef.current) {
            setTimeout(() => {
                fitRef.current?.fit();
                if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                    wsRef.current.send(JSON.stringify({
                        type: 'resize',
                        cols: xtermRef.current.cols,
                        rows: xtermRef.current.rows,
                    }));
                }
            }, 50);
        }
    }, [isOpen, height]);

    useEffect(() => {
        if (lastWorkspaceRef.current === workingDir) {
            return;
        }

        lastWorkspaceRef.current = workingDir;
        setSessions([]);
        setActiveId('');

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (isOpen && initializedRef.current) {
            if (xtermRef.current) {
                xtermRef.current.clear();
                xtermRef.current.reset();
            }
            connect('create');
        }
    }, [workingDir, isOpen, connect]);

    const switchSession = useCallback((id: string) => {
        if (id === activeId) return;
        if (xtermRef.current) {
            xtermRef.current.clear();
            xtermRef.current.reset();
        }
        connect('attach', id);
    }, [activeId, connect]);

    const createNewSession = useCallback(() => {
        if (xtermRef.current) {
            xtermRef.current.clear();
            xtermRef.current.reset();
        }
        connect('create');
    }, [connect]);

    const killSession = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'kill', id }));
        }
    }, []);

    // Tab rename
    const startRenaming = useCallback((id: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingTab(id);
        setEditValue(currentTitle);
    }, []);

    const commitRename = useCallback(() => {
        if (editingTab && editValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'rename', id: editingTab, title: editValue.trim() }));
        }
        setEditingTab(null);
    }, [editingTab, editValue]);

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitRename();
        } else if (e.key === 'Escape') {
            setEditingTab(null);
        }
    }, [commitRename]);

    // Resize handle
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = true;
        const startY = e.clientY;
        const startH = height;

        const onMove = (me: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = startY - me.clientY;
            const newH = Math.max(120, Math.min(600, startH + delta));
            onHeightChange(newH);
        };

        const onUp = () => {
            resizingRef.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setTimeout(() => {
                fitRef.current?.fit();
                if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                    wsRef.current.send(JSON.stringify({
                        type: 'resize',
                        cols: xtermRef.current.cols,
                        rows: xtermRef.current.rows,
                    }));
                }
            }, 50);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [height, onHeightChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            wsRef.current?.close();
            xtermRef.current?.dispose();
            initializedRef.current = false;
        };
    }, []);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="terminal-panel" style={{ height }}>
            <div className="terminal-resize-handle" onMouseDown={handleResizeStart} />
            <div className="terminal-header">
                <div className="terminal-header-left">
                    <TerminalIcon size={13} />
                    <span>TERMINAL</span>
                </div>

                <div className="terminal-tabs">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            className={`terminal-tab ${s.id === activeId ? 'active' : ''}`}
                            onClick={() => switchSession(s.id)}
                        >
                            {editingTab === s.id ? (
                                <input
                                    className="terminal-tab-rename-input"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={handleRenameKeyDown}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                />
                            ) : (
                                <span
                                    className="terminal-tab-title"
                                    onDoubleClick={e => startRenaming(s.id, s.title, e)}
                                >
                                    {s.title}
                                </span>
                            )}
                            <button
                                className="terminal-tab-close"
                                onClick={(e) => killSession(s.id, e)}
                                title="Kill terminal"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}
                    <button className="terminal-tab-add" onClick={createNewSession} title="New Terminal">
                        <Plus size={12} />
                    </button>
                </div>

                <div className="terminal-header-actions">
                    <button onClick={onToggle} title="Close Panel">
                        <ChevronDown size={14} />
                    </button>
                </div>
            </div>
            <div className="terminal-body" ref={termRef} />
        </div>
    );
}
