import '@xterm/xterm/css/xterm.css'
import './TerminalPanel.css'
import { ChevronDown, X, Terminal as TerminalIcon, Plus } from 'lucide-react'
import { useStudioStore } from '../../store'
import { useTerminalConnection, useTerminalResize } from './useTerminalConnection'

interface TerminalPanelProps {
    isOpen: boolean
    onToggle: () => void
    height: number
    onHeightChange: (h: number) => void
}

export default function TerminalPanel({ isOpen, onToggle, height, onHeightChange }: TerminalPanelProps) {
    const workingDir = useStudioStore(s => s.workingDir)

    const {
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
    } = useTerminalConnection(isOpen, height, onToggle, workingDir)

    const handleResizeStart = useTerminalResize(height, onHeightChange)

    if (!isOpen) {
        return null
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
    )
}
