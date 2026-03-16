import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Wrench, Terminal, FileEdit } from 'lucide-react'
import type { ChatMessageToolInfo } from '../../types'
import { useUISettings } from '../../store/settingsSlice'
import './ToolGroup.css'

function formatToolDuration(time: ChatMessageToolInfo['time']) {
    if (!time?.start) {
        return null
    }
    const durationMs = Math.max(0, (time.end || Date.now()) - time.start)
    if (durationMs < 1000) {
        return `${durationMs}ms`
    }
    if (durationMs < 60_000) {
        return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
    }
    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.round((durationMs % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
}

function ToolStatusIcon({ status }: { status: ChatMessageToolInfo['status'] }) {
    if (status === 'pending' || status === 'running') {
        return <Loader2 size={12} className="spin-icon" />
    }
    if (status === 'completed') {
        return <Check size={12} />
    }
    if (status === 'error') {
        return <AlertTriangle size={12} />
    }
    return null
}

export function ToolCallRow({ tool }: { tool: ChatMessageToolInfo }) {
    const { shellToolPartsExpanded, editToolPartsExpanded } = useUISettings()
    const isShell = tool.name === 'execute_command' || tool.name === 'execute_background_command' || tool.name === 'run_terminal_command' || tool.name === 'run_command'
    const isEdit = tool.name === 'replace_in_file' || tool.name === 'multi_replace_file_content' || tool.name === 'write_to_file' || tool.name === 'str_replace_editor'
    
    // Determine title block
    let displayTitle = tool.title || tool.name
    let displayDesc = ''
    if (isShell) {
        displayDesc = String(tool.input?.command || tool.input?.CommandLine || '')
        displayTitle = 'Run Command'
    } else if (isEdit) {
        displayDesc = String(tool.input?.path || tool.input?.TargetFile || tool.input?.file || '')
        displayTitle = 'Edit File'
    }

    const initialState = isShell ? shellToolPartsExpanded : isEdit ? editToolPartsExpanded : false
    const [expanded, setExpanded] = useState(initialState)

    const statusClass = `tool-row--${tool.status}`
    const durationLabel = formatToolDuration(tool.time)

    return (
        <div className={`tool-row ${statusClass}`}>
            <button className="tool-row__header" onClick={() => setExpanded(!expanded)}>
                <span className="tool-row__indicator">
                    <ToolStatusIcon status={tool.status} />
                </span>
                {isShell ? (
                    <Terminal size={10} className="tool-row__wrench" style={{ color: 'var(--text-secondary)' }} />
                ) : isEdit ? (
                    <FileEdit size={10} className="tool-row__wrench" style={{ color: 'var(--text-secondary)' }} />
                ) : (
                    <Wrench size={10} className="tool-row__wrench" />
                )}
                <span className="tool-row__name">{displayTitle}</span>
                {displayDesc && <span className="tool-row__desc" style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{displayDesc}</span>}
                {durationLabel ? <span className="tool-row__duration" style={{ marginLeft: 'auto', fontSize: '10px' }}>{durationLabel}</span> : null}
                <span className="tool-row__chevron">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
            </button>
            {expanded ? (
                <div className="tool-row__detail">
                    {isShell ? (
                        <div className="tool-row__section tool-row__section--terminal">
                            {tool.input && (
                                <div className="terminal-command">
                                    <span style={{ color: 'var(--accent)', marginRight: '8px' }}>$</span>
                                    {String(tool.input.command || tool.input.CommandLine || '')}
                                </div>
                            )}
                            {tool.output && (
                                <div className="terminal-output">{tool.output}</div>
                            )}
                            {tool.error && (
                                <div className="terminal-error" style={{ color: 'var(--error-fg)' }}>{tool.error}</div>
                            )}
                            {tool.status === 'running' && !tool.output && !tool.error && (
                                <div className="terminal-output" style={{ opacity: 0.5 }}>...</div>
                            )}
                        </div>
                    ) : isEdit ? (
                        <div className="tool-row__section tool-row__section--edit">
                            {tool.input?.path || tool.input?.TargetFile || tool.input?.file ? (
                                <div style={{ fontSize: '11px', padding: '4px 8px', background: 'var(--bg-default)', borderBottom: '1px solid var(--border-light)', fontFamily: 'monospace' }}>
                                    {String(tool.input.path || tool.input.TargetFile || tool.input.file || '')}
                                </div>
                            ) : null}
                            {tool.input && (
                                <pre className="tool-row__pre" style={{ margin: 0, border: 'none' }}>
                                    {JSON.stringify(tool.input, null, 2)}
                                </pre>
                            )}
                            {tool.output && (
                                <pre className="tool-row__pre" style={{ borderTop: '1px outset var(--border-light)', margin: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>{tool.output}</pre>
                            )}
                            {tool.error && (
                                <pre className="tool-row__pre tool-row__section--error">{tool.error}</pre>
                            )}
                        </div>
                    ) : (
                        <>
                            {tool.input && Object.keys(tool.input).length > 0 ? (
                                <div className="tool-row__section">
                                    <span className="tool-row__section-label">Input</span>
                                    <pre className="tool-row__pre">{JSON.stringify(tool.input, null, 2)}</pre>
                                </div>
                            ) : null}
                            {tool.output ? (
                                <div className="tool-row__section">
                                    <span className="tool-row__section-label">Output</span>
                                    <pre className="tool-row__pre">{tool.output.length > 500 ? `${tool.output.slice(0, 500)}...` : tool.output}</pre>
                                </div>
                            ) : null}
                            {tool.error ? (
                                <div className="tool-row__section tool-row__section--error">
                                    <span className="tool-row__section-label">Error</span>
                                    <pre className="tool-row__pre">{tool.error}</pre>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            ) : null}
        </div>
    )
}

export function ToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    const [collapsed, setCollapsed] = useState(false)

    // Single tool: no group wrapper
    if (tools.length === 1) {
        return <ToolCallRow tool={tools[0]} />
    }

    const completedCount = tools.filter((t) => t.status === 'completed').length
    const runningCount = tools.filter((t) => t.status === 'running' || t.status === 'pending').length
    const errorCount = tools.filter((t) => t.status === 'error').length

    return (
        <div className="tool-group">
            <button className="tool-group__header" onClick={() => setCollapsed(!collapsed)}>
                <span className="tool-group__indicator">
                    {runningCount > 0
                        ? <Loader2 size={12} className="spin-icon" />
                        : errorCount > 0
                            ? <AlertTriangle size={12} />
                            : <Check size={12} />}
                </span>
                <Wrench size={10} className="tool-group__wrench" />
                <span className="tool-group__label">
                    {runningCount > 0
                        ? `${completedCount}/${tools.length} tools used`
                        : `${tools.length} tools used`}
                </span>
                {errorCount > 0 ? <span className="tool-group__error-badge">{errorCount} error{errorCount > 1 ? 's' : ''}</span> : null}
                <span className="tool-group__chevron">
                    {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                </span>
            </button>
            {!collapsed ? (
                <div className="tool-group__list">
                    {tools.map((tool) => (
                        <ToolCallRow key={tool.callId} tool={tool} />
                    ))}
                </div>
            ) : null}
        </div>
    )
}
