import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

interface TermSession {
    id: string
    title: string
    connected: boolean
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
}

function buildTerminalWebSocketUrl(action: 'create' | 'attach', workingDir: string | null, targetId?: string) {
    const url = new URL('/ws/terminal', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('action', action)
    if (targetId) {
        url.searchParams.set('id', targetId)
    }
    if (workingDir) {
        url.searchParams.set('cwd', workingDir)
    }
    return url.toString()
}

export interface TerminalConnectionState {
    termRef: React.RefObject<HTMLDivElement | null>
    sessions: TermSession[]
    activeId: string
    editingTab: string | null
    editValue: string
    setEditValue: (value: string) => void
    switchSession: (id: string) => void
    createNewSession: () => void
    killSession: (id: string, e: React.MouseEvent) => void
    startRenaming: (id: string, currentTitle: string, e: React.MouseEvent) => void
    commitRename: () => void
    handleRenameKeyDown: (e: React.KeyboardEvent) => void
}

export function useTerminalConnection(
    isOpen: boolean,
    height: number,
    onToggle: () => void,
    workingDir: string,
): TerminalConnectionState {
    const termRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const initializedRef = useRef(false)

    const [sessions, setSessions] = useState<TermSession[]>([])
    const [activeId, setActiveId] = useState<string>('')
    const [editingTab, setEditingTab] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const lastWorkspaceRef = useRef(workingDir)
    const initialized = useRef(false)

    // Connect or reconnect WebSocket
    const connect = useCallback((action: 'create' | 'attach' = 'create', targetId?: string) => {
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        const ws = new WebSocket(buildTerminalWebSocketUrl(action, workingDir, targetId))
        wsRef.current = ws

        ws.onopen = () => {
            initialized.current = false
            if (xtermRef.current) {
                xtermRef.current.clear()
                xtermRef.current.reset()
            }
        }

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data)
                switch (msg.type) {
                    case 'output': {
                        if (!initialized.current) {
                            const stripped = msg.data
                                .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
                                .replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '')
                                .replace(/\x1b[^[\]].?/g, '')
                                .replace(/[\r\n]/g, '')
                                .trim()
                            if (!stripped || /\{"cursor":\d+\}/.test(stripped) || /^%+$/.test(stripped)) {
                                break
                            }
                            initialized.current = true
                        }
                        xtermRef.current?.write(msg.data)
                        break
                    }
                    case 'connected':
                    case 'attached':
                        setActiveId(msg.id)
                        if (msg.sessions) setSessions(msg.sessions)
                        setTimeout(() => {
                            fitRef.current?.fit()
                            if (xtermRef.current && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'resize',
                                    cols: xtermRef.current.cols,
                                    rows: xtermRef.current.rows,
                                }))
                            }
                        }, 100)
                        break
                    case 'sessions':
                        setSessions(msg.sessions || [])
                        break
                    case 'exit': {
                        const exitedId = msg.id || activeId
                        setSessions(prev => prev.filter(s => s.id !== exitedId))
                        break
                    }
                    case 'error':
                        xtermRef.current?.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`)
                        break
                }
            } catch {
                // ignore
            }
        }

        ws.onclose = () => { }
    }, [workingDir])

    useEffect(() => {
        if (!activeId) return
        if (sessions.length === 0) {
            setActiveId('')
            onToggle()
            return
        }
        const activeExists = sessions.some(s => s.id === activeId)
        if (!activeExists) {
            const next = sessions[0]
            setActiveId(next.id)
            if (xtermRef.current) {
                xtermRef.current.clear()
                xtermRef.current.reset()
            }
            connect('attach', next.id)
        }
    }, [sessions, activeId, connect, onToggle])

    // Initialize xterm once
    useEffect(() => {
        if (!isOpen || !termRef.current || initializedRef.current) return

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: '"Menlo", monospace',
            lineHeight: 1.2,
            letterSpacing: 0,
            theme: termTheme,
            allowProposedApi: true,
            allowTransparency: false,
        })

        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(termRef.current)
        try {
            term.loadAddon(new WebglAddon())
        } catch (e) {
            console.warn('[terminal] WebGL addon failed, falling back to canvas renderer', e)
        }
        fit.fit()

        xtermRef.current = term
        fitRef.current = fit
        initializedRef.current = true

        term.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }))
            }
        })

        connect('create')

        return () => { }
    }, [isOpen, connect])

    // Fit when height changes
    useEffect(() => {
        if (isOpen && fitRef.current && xtermRef.current) {
            setTimeout(() => {
                fitRef.current?.fit()
                if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                    wsRef.current.send(JSON.stringify({
                        type: 'resize',
                        cols: xtermRef.current.cols,
                        rows: xtermRef.current.rows,
                    }))
                }
            }, 50)
        }
    }, [isOpen, height])

    useEffect(() => {
        if (lastWorkspaceRef.current === workingDir) {
            return
        }

        lastWorkspaceRef.current = workingDir
        setSessions([])
        setActiveId('')

        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        if (isOpen && initializedRef.current) {
            if (xtermRef.current) {
                xtermRef.current.clear()
                xtermRef.current.reset()
            }
            connect('create')
        }
    }, [workingDir, isOpen, connect])

    const switchSession = useCallback((id: string) => {
        if (id === activeId) return
        if (xtermRef.current) {
            xtermRef.current.clear()
            xtermRef.current.reset()
        }
        connect('attach', id)
    }, [activeId, connect])

    const createNewSession = useCallback(() => {
        if (xtermRef.current) {
            xtermRef.current.clear()
            xtermRef.current.reset()
        }
        connect('create')
    }, [connect])

    const killSession = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'kill', id }))
        }
    }, [])

    const startRenaming = useCallback((id: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingTab(id)
        setEditValue(currentTitle)
    }, [])

    const commitRename = useCallback(() => {
        if (editingTab && editValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'rename', id: editingTab, title: editValue.trim() }))
        }
        setEditingTab(null)
    }, [editingTab, editValue])

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitRename()
        } else if (e.key === 'Escape') {
            setEditingTab(null)
        }
    }, [commitRename])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            wsRef.current?.close()
            xtermRef.current?.dispose()
            initializedRef.current = false
        }
    }, [])

    return {
        termRef,
        sessions,
        activeId,
        editingTab,
        editValue,
        setEditValue,
        switchSession,
        createNewSession,
        killSession,
        startRenaming,
        commitRename,
        handleRenameKeyDown,
    }
}

export function useTerminalResize(
    height: number,
    onHeightChange: (h: number) => void,
) {
    const resizingRef = useRef(false)

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        resizingRef.current = true
        const startY = e.clientY
        const startH = height

        const onMove = (me: MouseEvent) => {
            if (!resizingRef.current) return
            const delta = startY - me.clientY
            const newH = Math.max(120, Math.min(600, startH + delta))
            onHeightChange(newH)
        }

        const onUp = () => {
            resizingRef.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [height, onHeightChange])

    return handleResizeStart
}
