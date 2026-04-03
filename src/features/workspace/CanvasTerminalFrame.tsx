import { useEffect, useRef, useCallback, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import { useStudioStore } from '../../store';
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame';
import './CanvasTerminalFrame.css';

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

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

function stripTerminalNoise(value: string) {
    let result = '';

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];

        if (char === ESC) {
            const next = value[index + 1];

            if (next === ']') {
                index += 2;
                while (index < value.length) {
                    if (value[index] === BEL) {
                        break;
                    }
                    if (value[index] === ESC && value[index + 1] === '\\') {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
                continue;
            }

            if (next === '[') {
                index += 2;
                while (index < value.length && !/[A-Za-z]/.test(value[index])) {
                    index += 1;
                }
                continue;
            }

            index += 1;
            continue;
        }

        if (char !== '\r' && char !== '\n' && char.charCodeAt(0) < 32) {
            continue;
        }

        result += char;
    }

    return result;
}

function buildTerminalWebSocketUrl(workingDir: string | null) {
    const url = new URL('/ws/terminal', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('action', 'create');
    if (workingDir) {
        url.searchParams.set('cwd', workingDir);
    }
    return url.toString();
}

type CanvasTerminalFrameData = {
    nodeId: string;
    title: string;
    width: number;
    height: number;
    onClose: () => void;
    onResize: (width: number, height: number) => void;
    onSessionChange: (sessionId: string | null, connected: boolean) => void;
    transformActive?: boolean;
    onActivateTransform?: () => void;
    onDeactivateTransform?: () => void;
}

export default function CanvasTerminalFrame({ data }: NodeProps<Node<CanvasTerminalFrameData, 'canvasTerminal'>>) {
    const { title, width, height, onClose, onSessionChange } = data;
    const transformActive = !!data.transformActive;
    const onActivateTransform = data.onActivateTransform;
    const onDeactivateTransform = data.onDeactivateTransform;
    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const initializedRef = useRef(false);
    const outputInitialized = useRef(false); // tracks first real output
    const [connected, setConnected] = useState(false);
    const [exited, setExited] = useState(false);
    const workingDir = useStudioStore(s => s.workingDir);

    const connect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const ws = new WebSocket(buildTerminalWebSocketUrl(workingDir));
        wsRef.current = ws;

        ws.onopen = () => {
            outputInitialized.current = false;
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
                        if (!outputInitialized.current) {
                            const stripped = stripTerminalNoise(msg.data)
                                .replace(/[\r\n]/g, '')
                                .trim();
                            if (!stripped || /\{"cursor":\d+\}/.test(stripped) || /^%+$/.test(stripped)) {
                                break;
                            }
                            outputInitialized.current = true;
                        }
                        xtermRef.current?.write(msg.data);
                        break;
                    }
                    case 'connected':
                        setConnected(true);
                        setExited(false);
                        onSessionChange(msg.id, true);
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
                    case 'exit':
                        setConnected(false);
                        setExited(true);
                        onSessionChange(null, false);
                        // Auto-remove after brief delay so user sees "Exited"
                        setTimeout(() => {
                            onClose();
                        }, 1500);
                        break;
                    case 'error':
                        xtermRef.current?.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
                        break;
                }
            } catch {
                // ignore
            }
        };

        ws.onclose = () => {
            setConnected(false);
            onSessionChange(null, false);
        };
    }, [workingDir, onSessionChange, onClose]);

    // Initialize xterm + connect once when mounted
    useEffect(() => {
        if (!termRef.current || initializedRef.current) return;

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
            console.warn('[canvas-terminal] WebGL addon failed, falling back to canvas renderer', e);
        }
        fit.fit();

        xtermRef.current = term;
        fitRef.current = fit;
        initializedRef.current = true;

        term.onData((d) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data: d }));
            }
        });

        connect();

        return () => { };
    }, [connect]);

    // Re-fit when size changes
    useEffect(() => {
        if (!fitRef.current || !xtermRef.current) return;
        const timer = setTimeout(() => {
            fitRef.current?.fit();
            if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                wsRef.current.send(JSON.stringify({
                    type: 'resize',
                    cols: xtermRef.current.cols,
                    rows: xtermRef.current.rows,
                }));
            }
        }, 60);
        return () => clearTimeout(timer);
    }, [width, height]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            wsRef.current?.close();
            xtermRef.current?.dispose();
            initializedRef.current = false;
        };
    }, []);

    const handleResizeEnd = useCallback(() => {
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
    }, []);

    return (
        <CanvasWindowFrame
            className="canvas-terminal-frame"
            width={width}
            height={height}
            transformActive={transformActive}
            onActivateTransform={onActivateTransform}
            onDeactivateTransform={onDeactivateTransform}
            onResizeEnd={handleResizeEnd}
            minWidth={400}
            minHeight={250}
            headerStart={(
                <>
                    <TerminalIcon size={12} />
                    <span className="canvas-frame__name">{title}</span>
                    <span className={`canvas-terminal-frame__status ${!connected ? 'canvas-terminal-frame__status--disconnected' : ''}`}>
                        {exited ? 'Exited' : connected ? 'Connected' : 'Connecting…'}
                    </span>
                </>
            )}
            headerEnd={(
                <button
                    className="icon-btn"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    title="Close terminal"
                >
                    <X size={12} />
                </button>
            )}
        >
            <div className="canvas-terminal-frame__body" ref={termRef} />
            {exited && (
                <div className="canvas-terminal-frame__exited">
                    <TerminalIcon size={14} />
                    <span>Process exited</span>
                </div>
            )}
        </CanvasWindowFrame>
    );
}
