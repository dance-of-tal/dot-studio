import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Wrench, Terminal, FileEdit, ListTodo, CheckCircle2, Circle, XCircle } from 'lucide-react'
import type { ChatMessageToolInfo } from '../../types'
import { useUISettings } from '../../store/settingsSlice'
import { useStudioStore } from '../../store'
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

const SHELL_NAMES = new Set([
    'bash', 'shell', 'execute_command', 'execute_background_command',
    'run_terminal_command', 'run_command',
])

const EDIT_NAMES = new Set([
    'replace_in_file', 'multi_replace_file_content', 'write_to_file',
    'str_replace_editor', 'apply_patch', 'create_file',
])

const TODO_NAMES = new Set(['todos', 'todowrite', 'todo', 'todoread'])

function extractShellCommand(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    // OpenCode bash tool uses input.command; some providers use args array
    if (input.command) return String(input.command)
    if (input.CommandLine) return String(input.CommandLine)
    if (Array.isArray(input.args) && input.args.length > 0) return input.args.join(' ')
    return ''
}

function TodoInlineList({ input, output }: { input?: Record<string, unknown>; output?: string }) {
    // Try to extract todos from the tool output or input
    let items: Array<{ content: string; status: string }> = []

    // Parse from output (JSON array of todos)
    if (output) {
        try {
            const parsed = JSON.parse(output)
            if (Array.isArray(parsed)) {
                items = parsed.map((t: any) => ({ content: t.content || t.title || String(t), status: t.status || 'pending' }))
            }
        } catch (e) {
            // Try line-based parse
            items = output.split('\n').filter(Boolean).map(line => ({ content: line, status: 'pending' }))
        }
    }

    // Also check store todos for the current session
    const sessionTodos = useStudioStore.getState().todos
    // Find the most recent session's todos if inline items are empty
    if (items.length === 0) {
        const allTodos = Object.values(sessionTodos).flat()
        if (allTodos.length > 0) items = allTodos.map((t: any) => ({ content: t.content, status: t.status }))
    }

    if (items.length === 0 && input) {
        // Show input as fallback
        return <pre className="tool-row__pre">{JSON.stringify(input, null, 2)}</pre>
    }

    const iconFor = (status: string) => {
        if (status === 'completed') return <CheckCircle2 size={13} style={{ color: '#10b981' }} />
        if (status === 'in_progress') return <Loader2 size={13} className="spin-icon" style={{ color: 'var(--accent)' }} />
        if (status === 'cancelled') return <XCircle size={13} style={{ color: 'var(--text-muted)' }} />
        return <Circle size={13} style={{ color: 'var(--text-muted)' }} />
    }

    return (
        <div className="todo-inline-list">
            {items.map((item, i) => (
                <div key={i} className={`todo-inline-item ${item.status === 'in_progress' ? 'todo-inline-item--active' : ''} ${item.status === 'completed' || item.status === 'cancelled' ? 'todo-inline-item--done' : ''}`}>
                    {iconFor(item.status)}
                    <span className={item.status === 'completed' || item.status === 'cancelled' ? 'todo-inline-text--done' : ''}>{item.content}</span>
                </div>
            ))}
        </div>
    )
}

export function ToolCallRow({ tool }: { tool: ChatMessageToolInfo }) {
    const { shellToolPartsExpanded, editToolPartsExpanded } = useUISettings()
    const isShell = SHELL_NAMES.has(tool.name)
    const isEdit = EDIT_NAMES.has(tool.name)
    const isTodo = TODO_NAMES.has(tool.name)
    
    // Determine title block
    let displayTitle = tool.title || tool.name
    let displayDesc = ''
    if (isShell) {
        displayDesc = extractShellCommand(tool.input)
        displayTitle = 'Run Command'
    } else if (isEdit) {
        displayDesc = String(tool.input?.path || tool.input?.TargetFile || tool.input?.file || '')
        displayTitle = 'Edit File'
    } else if (isTodo) {
        displayTitle = tool.title || `${tool.input?.todos ? (tool.input.todos as any[]).length : ''} todos`
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
                    <Terminal size={10} className="tool-row__wrench" />
                ) : isEdit ? (
                    <FileEdit size={10} className="tool-row__wrench" />
                ) : isTodo ? (
                    <ListTodo size={10} className="tool-row__wrench" />
                ) : (
                    <Wrench size={10} className="tool-row__wrench" />
                )}
                <span className="tool-row__name">{displayTitle}</span>
                {displayDesc && <span className="tool-row__desc">{displayDesc}</span>}
                {durationLabel ? <span className="tool-row__duration">{durationLabel}</span> : null}
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
                                    <span className="terminal-prompt">$</span>
                                    {extractShellCommand(tool.input)}
                                </div>
                            )}
                            {tool.output && (
                                <div className="terminal-output">{tool.output}</div>
                            )}
                            {tool.error && (
                                <div className="terminal-error">{tool.error}</div>
                            )}
                            {tool.status === 'running' && !tool.output && !tool.error && (
                                <div className="terminal-output" style={{ opacity: 0.4 }}>...</div>
                            )}
                        </div>
                    ) : isEdit ? (
                        <div className="tool-row__section tool-row__section--edit">
                            {tool.input?.path || tool.input?.TargetFile || tool.input?.file ? (
                                <div className="edit-file-path">
                                    {String(tool.input.path || tool.input.TargetFile || tool.input.file || '')}
                                </div>
                            ) : null}
                            {tool.input && (
                                <pre className="tool-row__pre" style={{ margin: 0, border: 'none' }}>
                                    {JSON.stringify(tool.input, null, 2)}
                                </pre>
                            )}
                            {tool.output && (
                                <pre className="tool-row__pre">{tool.output}</pre>
                            )}
                            {tool.error && (
                                <pre className="tool-row__pre tool-row__section--error">{tool.error}</pre>
                            )}
                        </div>
                    ) : isTodo ? (
                        <div className="tool-row__section" style={{ padding: '6px 8px' }}>
                            <TodoInlineList input={tool.input} output={tool.output} />
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
