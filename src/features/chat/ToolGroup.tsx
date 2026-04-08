import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Todo } from '@opencode-ai/sdk/v2'
import type { ChatMessageToolInfo } from '../../types'
import { useUISettings } from '../../store/settingsSlice'
import { useStudioStore } from '../../store'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { DiffChanges } from '../../components/chat/DiffChanges'
import { SyntaxBlock, DiffBlock } from '../../components/chat/SyntaxBlock'
import './ToolGroup.css'

/* ═══════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════ */

function formatToolDuration(time: ChatMessageToolInfo['time']) {
    if (!time?.start) return null
    const durationMs = Math.max(0, (time.end || Date.now()) - time.start)
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.round((durationMs % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
}

function getFilename(path: string): string {
    if (!path) return ''
    const parts = path.split('/')
    return parts[parts.length - 1] || path
}

function getDirectory(path: string): string {
    if (!path.includes('/')) return ''
    const parts = path.split('/')
    return parts.slice(0, -1).join('/') + '/'
}

function extractShellCommand(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    if (input.command) return String(input.command)
    if (input.CommandLine) return String(input.CommandLine)
    if (Array.isArray(input.args) && input.args.length > 0) return input.args.join(' ')
    return ''
}

function extractFilePath(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.path || input.TargetFile || input.file || input.filePath || input.AbsolutePath || '')
}

function extractFileContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.content || input.CodeContent || input.new_string || input.newString || '')
}

function extractToolMetadata(tool: ChatMessageToolInfo): Record<string, unknown> | undefined {
    return tool.metadata
}

function extractOldContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.old_string || input.oldString || input.TargetContent || '')
}

function extractNewContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.new_string || input.newString || input.ReplacementContent || '')
}

function countDiffLines(oldStr: string, newStr: string): { additions: number; deletions: number } {
    const oldLines = oldStr ? oldStr.split('\n').length : 0
    const newLines = newStr ? newStr.split('\n').length : 0
    return {
        additions: Math.max(0, newLines - oldLines + (oldLines > 0 ? oldLines : 0)),
        deletions: oldLines,
    }
}

function extractPatchText(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    if (typeof input.diff === 'string') return input.diff
    if (typeof input.patch === 'string') return input.patch
    if (typeof input.content === 'string') return input.content
    return ''
}

function readToolString(record: Record<string, unknown> | undefined, ...keys: string[]): string {
    if (!record) return ''
    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value) {
            return value
        }
    }
    return ''
}

type ApplyPatchMetadataFile = {
    filePath?: string
    relativePath?: string
    type?: 'add' | 'update' | 'delete' | 'move'
    diff?: string
    before?: string
    after?: string
    additions?: number
    deletions?: number
    movePath?: string
}

function extractApplyPatchFiles(tool: ChatMessageToolInfo): ApplyPatchMetadataFile[] {
    const metadata = extractToolMetadata(tool)
    const files = metadata?.files
    if (!Array.isArray(files)) return []
    return files.filter((file): file is ApplyPatchMetadataFile => !!file && typeof file === 'object')
}

function parsePatchFiles(patchText: string): Array<{ filename: string; diff: string; type: 'add' | 'update' | 'delete' }> {
    if (!patchText) return []

    const fileBlocks: Array<{ filename: string; diff: string; type: 'add' | 'update' | 'delete' }> = []
    const lines = patchText.split('\n')
    let currentFile = ''
    let currentDiff: string[] = []
    let currentType: 'add' | 'update' | 'delete' = 'update'

    for (const line of lines) {
        const diffHeader = line.match(/^diff --git a\/(.*?) b\/(.*?)$/)
        const minusFile = line.match(/^--- (?:a\/)?(.+)$/)
        const plusFile = line.match(/^\+\+\+ (?:b\/)?(.+)$/)

        if (diffHeader) {
            if (currentFile && currentDiff.length) {
                fileBlocks.push({ filename: currentFile, diff: currentDiff.join('\n'), type: currentType })
            }
            currentFile = diffHeader[2] || diffHeader[1] || ''
            currentDiff = [line]
            currentType = 'update'
        } else if (plusFile && plusFile[1] !== '/dev/null' && !currentFile) {
            currentFile = plusFile[1]
            currentDiff.push(line)
        } else if (minusFile && minusFile[1] === '/dev/null') {
            currentType = 'add'
            currentDiff.push(line)
        } else if (plusFile && plusFile[1] === '/dev/null') {
            currentType = 'delete'
            currentDiff.push(line)
        } else {
            currentDiff.push(line)
        }
    }

    if (currentFile && currentDiff.length) {
        fileBlocks.push({ filename: currentFile, diff: currentDiff.join('\n'), type: currentType })
    }

    return fileBlocks
}

/* ═══════════════════════════════════════════════════════
   Tool name sets
   ═══════════════════════════════════════════════════════ */

const CONTEXT_NAMES = new Set(['read', 'read_file', 'read_many', 'list', 'list_dir', 'glob', 'grep', 'grep_search', 'find_by_name', 'view_file'])
const SHELL_NAMES = new Set(['bash', 'shell', 'execute_command', 'execute_background_command', 'run_terminal_command', 'run_command'])
const EDIT_NAMES = new Set(['replace_in_file', 'multi_replace_file_content', 'str_replace_editor', 'replace_file_content', 'edit'])
const WRITE_NAMES = new Set(['write_to_file', 'create_file', 'write'])
const PATCH_NAMES = new Set(['apply_patch'])
const TODO_NAMES = new Set(['todos', 'todowrite', 'todo', 'todoread'])
const SEARCH_NAMES = new Set(['websearch', 'webfetch', 'search_web', 'read_url_content'])
const CODESEARCH_NAMES = new Set(['codesearch'])
const TASK_NAMES = new Set(['task', 'browser_subagent'])
const SKILL_NAMES = new Set(['skill'])

/* ═══════════════════════════════════════════════════════
   BasicTool — collapsible wrapper (OpenCode pattern)
   ═══════════════════════════════════════════════════════ */

interface BasicToolProps {
    badge: string
    /** Two-line trigger: provides structured title/filename/directory/actions layout */
    trigger?: ReactNode
    /** Simple one-line trigger: title + subtitle text */
    title?: string | ReactNode
    subtitle?: string | ReactNode
    status: ChatMessageToolInfo['status']
    duration?: string | null
    actions?: ReactNode
    children?: ReactNode
    hideDetails?: boolean
    defaultOpen?: boolean
    className?: string
}

function BasicTool({
    badge,
    trigger,
    title,
    subtitle,
    status,
    duration,
    actions,
    children,
    hideDetails,
    defaultOpen = false,
    className = '',
}: BasicToolProps) {
    const pending = status === 'pending' || status === 'running'
    const isError = status === 'error'
    const [open, setOpen] = useState(defaultOpen)
    const hasContent = !!children && !hideDetails
    const canToggle = hasContent && !pending

    const statusClass = `basic-tool--${status}`

    const badgeLabel = pending ? 'RUN' : isError ? 'ERR' : badge

    return (
        <div className={`basic-tool ${statusClass} ${className}`}>
            <button
                className="basic-tool__trigger"
                onClick={() => canToggle && setOpen(!open)}
                type="button"
                style={{ cursor: canToggle ? 'pointer' : 'default' }}
            >
                <span className="basic-tool__disclosure" aria-hidden="true">
                    {canToggle ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : (
                        <span className="basic-tool__disclosure-spacer" />
                    )}
                </span>
                <span className={`basic-tool__status-dot${isError ? ' basic-tool__status-dot--error' : ''}`} />
                <span className={`basic-tool__badge${isError ? ' basic-tool__badge--error' : ''}`}>
                    {badgeLabel}
                </span>
                {trigger ? (
                    <span className="basic-tool__trigger-content">{trigger}</span>
                ) : (
                    <span className="basic-tool__info">
                        <span className="basic-tool__title">
                            {typeof title === 'string' ? (
                                <TextShimmer text={title} active={pending} />
                            ) : title}
                        </span>
                        {!pending && subtitle && (
                            <span className="basic-tool__subtitle">{subtitle}</span>
                        )}
                    </span>
                )}
                {!pending && actions && <span className="basic-tool__actions">{actions}</span>}
                {!pending && duration && <span className="basic-tool__duration">{duration}</span>}
            </button>
            {open && hasContent && (
                <div className="basic-tool__content">{children}</div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   ToolErrorCard — dedicated error display
   ═══════════════════════════════════════════════════════ */

function ToolErrorCard({ error, toolName }: { error: string; toolName: string }) {
    const [copied, setCopied] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(error)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [error])

    const preview = error.length > 120 ? error.slice(0, 120) + '…' : error

    return (
        <div className="tool-error-card">
            <div className="tool-error-card__header">
                <span className="tool-error-card__pill">ERROR</span>
                <span className="tool-error-card__name">{toolName}</span>
                <button
                    className="tool-error-card__copy"
                    onClick={(e) => { e.stopPropagation(); void handleCopy() }}
                    title={copied ? 'Copied!' : 'Copy error'}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <button
                className="tool-error-card__body"
                onClick={() => setExpanded(!expanded)}
                type="button"
            >
                <pre className="tool-error-card__text">{expanded ? error : preview}</pre>
                {error.length > 120 && (
                    <span className="tool-error-card__toggle">
                        {expanded ? 'Less' : 'More'}
                    </span>
                )}
            </button>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   EditWriteTrigger — shared two-line trigger for edit/write
   ═══════════════════════════════════════════════════════ */

function EditWriteTrigger({
    label,
    pending,
    filename,
    directory,
    diffChanges,
}: {
    label: string
    pending: boolean
    filename: string
    directory: string
    diffChanges?: { additions: number; deletions: number } | null
}) {
    return (
        <div className="edit-trigger">
            <div className="edit-trigger__title-area">
                <div className="edit-trigger__title">
                    <span className="edit-trigger__title-text">
                        <TextShimmer text={filename || label} active={pending} />
                    </span>
                </div>
                {!pending && directory && (
                    <div className="edit-trigger__path">
                        <span className="edit-trigger__directory">{directory}</span>
                    </div>
                )}
            </div>
            <div className="edit-trigger__actions">
                {!pending && diffChanges && (diffChanges.additions > 0 || diffChanges.deletions > 0) && (
                    <DiffChanges changes={diffChanges} />
                )}
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   ToolFileAccordion — sticky file header + content
   ═══════════════════════════════════════════════════════ */

function ToolFileAccordion({
    path,
    badge,
    defaultOpen = false,
    children,
}: {
    path: string
    badge?: ReactNode
    defaultOpen?: boolean
    children?: ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    const filename = getFilename(path)
    const directory = getDirectory(path)

    return (
        <div className={`tool-file-accordion${open ? ' tool-file-accordion--open' : ''}`}>
            <button className="tool-file-accordion__header" onClick={() => setOpen(!open)} type="button">
                <span className="tool-file-accordion__disclosure" aria-hidden="true">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="tool-file-accordion__name">{filename}</span>
                {directory && <span className="tool-file-accordion__dir">{directory}</span>}
                {badge && <span className="tool-file-accordion__badge">{badge}</span>}
            </button>
            {open && children && (
                <div className="tool-file-accordion__content">{children}</div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   ToolCallRow — per-tool rendering using BasicTool
   ═══════════════════════════════════════════════════════ */

export function ToolCallRow({ tool, compact = false }: { tool: ChatMessageToolInfo; compact?: boolean }) {
    const shellToolPartsExpanded = useUISettings((state) => state.shellToolPartsExpanded)
    const editToolPartsExpanded = useUISettings((state) => state.editToolPartsExpanded)
    const isShell = SHELL_NAMES.has(tool.name)
    const isEdit = EDIT_NAMES.has(tool.name)
    const isWrite = WRITE_NAMES.has(tool.name)
    const isPatch = PATCH_NAMES.has(tool.name)
    const isTodo = TODO_NAMES.has(tool.name)
    const isContext = CONTEXT_NAMES.has(tool.name)
    const isSearch = SEARCH_NAMES.has(tool.name)
    const isCodeSearch = CODESEARCH_NAMES.has(tool.name)
    const isTask = TASK_NAMES.has(tool.name)
    const isSkill = SKILL_NAMES.has(tool.name)
    const pending = tool.status === 'pending' || tool.status === 'running'
    const isError = tool.status === 'error'

    const [copied, setCopied] = useState(false)
    const handleCopy = useCallback(async (text: string) => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [])

    const durationLabel = formatToolDuration(tool.time)

    /* ── Shell/Bash ── */
    if (isShell) {
        const cmd = extractShellCommand(tool.input)
        const metadata = extractToolMetadata(tool)
        const desc = readToolString(tool.input, 'description') || readToolString(metadata, 'description') || undefined
        const output = tool.output || readToolString(metadata, 'output', 'stdout')
        const combined = `$ ${cmd}${output ? '\n\n' + output : ''}`
        const summary = desc || cmd || 'Running command'

        return (
            <BasicTool
                badge="SHELL"
                trigger={
                    <div className="shell-trigger">
                        <span className="shell-trigger__title">
                            <TextShimmer text={summary} active={pending} />
                        </span>
                        {!pending && desc && cmd && desc !== cmd && (
                            <span className="shell-trigger__desc">{cmd}</span>
                        )}
                    </div>
                }
                status={tool.status}
                duration={durationLabel}
                defaultOpen={shellToolPartsExpanded}
            >
                <div className="tool-content-terminal" data-scrollable>
                    <button
                        className="tool-copy-btn"
                        onClick={(e) => { e.stopPropagation(); void handleCopy(combined) }}
                        title={copied ? 'Copied!' : 'Copy'}
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <pre className="tool-pre"><code>{combined}</code></pre>
                </div>
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    /* ── Edit (str_replace, multi_replace, etc.) ── */
    if (isEdit) {
        const metadata = extractToolMetadata(tool)
        const filePath = extractFilePath(tool.input)
        const filename = getFilename(filePath)
        const directory = getDirectory(filePath)
        const oldContent = extractOldContent(tool.input)
        const newContent = extractNewContent(tool.input)
        const diff = oldContent || newContent ? countDiffLines(oldContent, newContent) : null
        const metadataDiff = readToolString(metadata, 'diff')

        return (
            <BasicTool
                badge="EDIT"
                trigger={
                    <EditWriteTrigger
                        label="Edit"
                        pending={pending}
                        filename={filename}
                        directory={directory}
                        diffChanges={diff}
                    />
                }
                status={tool.status}
                duration={durationLabel}
                defaultOpen={editToolPartsExpanded}
            >
                {filePath && metadataDiff && (
                    <SyntaxBlock code={metadataDiff} language="diff" lineNumbers={false} maxHeight={400} />
                )}
                {filePath && !metadataDiff && (oldContent || newContent) && (
                    <DiffBlock
                        before={oldContent}
                        after={newContent}
                        filename={filename}
                    />
                )}
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    /* ── Write (write_to_file, create_file) ── */
    if (isWrite) {
        const filePath = extractFilePath(tool.input)
        const filename = getFilename(filePath)
        const directory = getDirectory(filePath)
        const content = extractFileContent(tool.input)

        return (
            <BasicTool
                badge="WRITE"
                trigger={
                    <EditWriteTrigger
                        label="Write"
                        pending={pending}
                        filename={filename}
                        directory={directory}
                    />
                }
                status={tool.status}
                duration={durationLabel}
                defaultOpen={editToolPartsExpanded}
            >
                {filePath && (
                    content ? (
                        <SyntaxBlock
                            code={content.length > 3000 ? content.slice(0, 3000) + '\n\n… (truncated)' : content}
                            filename={filename}
                            maxHeight={400}
                        />
                    ) : tool.output ? (
                        <pre className="tool-pre tool-pre--panel">{tool.output}</pre>
                    ) : null
                )}
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    /* ── apply_patch (unified diff) ── */
    if (isPatch) {
        const patchText = extractPatchText(tool.input)
        const metadataFiles = extractApplyPatchFiles(tool)
        const patchFiles: ApplyPatchMetadataFile[] = metadataFiles.length > 0
            ? metadataFiles
            : parsePatchFiles(patchText).map((file) => ({
                filePath: file.filename,
                relativePath: file.filename,
                type: file.type,
                diff: file.diff,
            }))

        // Single file or unknown format — show whole diff
        if (patchFiles.length <= 1) {
            const singlePath = patchFiles[0]?.relativePath || patchFiles[0]?.filePath || extractFilePath(tool.input)
            const singleFilename = singlePath ? getFilename(singlePath) : 'patch'
            const singleDir = singlePath ? getDirectory(singlePath) : ''
            const singleFile = patchFiles[0]
            const singleChanges = typeof singleFile?.additions === 'number' || typeof singleFile?.deletions === 'number'
                ? {
                    additions: typeof singleFile?.additions === 'number' ? singleFile.additions : 0,
                    deletions: typeof singleFile?.deletions === 'number' ? singleFile.deletions : 0,
                }
                : null
            const singleLabel = singlePath ? 'Patch' : (pending ? 'Preparing patch' : '1 file changed')

            return (
                <BasicTool
                    badge="PATCH"
                    trigger={
                        <EditWriteTrigger
                            label={singleLabel}
                            pending={pending}
                            filename={singlePath ? singleFilename : ''}
                            directory={singleDir}
                            diffChanges={singleChanges}
                        />
                    }
                    status={tool.status}
                    duration={durationLabel}
                    defaultOpen={editToolPartsExpanded}
                >
                    {singleFile?.before !== undefined || singleFile?.after !== undefined ? (
                        <DiffBlock
                            before={singleFile?.before || ''}
                            after={singleFile?.after || ''}
                            filename={singleFilename}
                        />
                    ) : patchText ? (
                        <SyntaxBlock code={patchText} language="diff" lineNumbers={false} maxHeight={500} />
                    ) : singleFile?.diff ? (
                        <SyntaxBlock code={singleFile.diff} language="diff" lineNumbers={false} maxHeight={500} />
                    ) : null}
                    {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
                </BasicTool>
            )
        }

        return (
            <BasicTool
                badge="PATCH"
                title={!pending ? `${patchFiles.length} files changed` : 'Preparing files'}
                status={tool.status}
                duration={durationLabel}
                defaultOpen={editToolPartsExpanded}
            >
                {patchFiles.map((file, idx) => {
                    const displayPath = file.relativePath || file.filePath || `patch-${idx + 1}`
                    const changeType = file.type || 'update'
                    const changes = typeof file.additions === 'number' || typeof file.deletions === 'number'
                        ? {
                            additions: typeof file.additions === 'number' ? file.additions : 0,
                            deletions: typeof file.deletions === 'number' ? file.deletions : 0,
                        }
                        : null

                    return (
                        <ToolFileAccordion
                            key={`${displayPath}:${idx}`}
                            path={displayPath}
                            defaultOpen={changeType !== 'delete'}
                            badge={
                                changeType === 'add' ? <span className="patch-badge patch-badge--add">created</span>
                                : changeType === 'delete' ? <span className="patch-badge patch-badge--del">deleted</span>
                                : changeType === 'move' ? <span className="patch-badge patch-badge--move">moved</span>
                                : changes ? <DiffChanges changes={changes} /> : null
                            }
                        >
                            {file.before !== undefined || file.after !== undefined ? (
                                <DiffBlock
                                    before={file.before || ''}
                                    after={file.after || ''}
                                    filename={getFilename(displayPath)}
                                />
                            ) : file.diff ? (
                                <SyntaxBlock code={file.diff} language="diff" lineNumbers={false} maxHeight={400} />
                            ) : null}
                        </ToolFileAccordion>
                    )
                })}
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    /* ── Todo ── */
    if (isTodo) {
        return (
            <BasicTool
                badge="TODO"
                title="Todos"
                status={tool.status}
                duration={durationLabel}
                defaultOpen
            >
                <div style={{ padding: '6px 8px' }}>
                    <TodoInlineList input={tool.input} output={tool.output} />
                </div>
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    /* ── Context tools (read/glob/grep/list) — compact in group ── */
    if (isContext && compact) {
        const label = tool.title || tool.name
        const path = extractFilePath(tool.input) || (tool.input?.pattern ? String(tool.input.pattern) : '')
        return (
            <div className="context-tool-item">
                <span className="context-tool-badge">CTX</span>
                <span className="context-tool-name">{label}</span>
                {path && <span className="context-tool-path">{getFilename(path) || path}</span>}
                {isError && <span className="context-tool-error">ERROR</span>}
            </div>
        )
    }

    /* ── Context tool (standalone, not in group) ── */
    if (isContext) {
        const filePath = extractFilePath(tool.input)
        const pattern = tool.input?.pattern ? String(tool.input.pattern) : ''
        const args: string[] = []
        if (tool.input?.offset) args.push(`offset=${tool.input.offset}`)
        if (tool.input?.limit) args.push(`limit=${tool.input.limit}`)
        if (pattern) args.push(`pattern=${pattern}`)

        return (
            <BasicTool
                badge="CTX"
                title={tool.title || tool.name}
                subtitle={!pending ? (filePath ? getFilename(filePath) : pattern) + (args.length ? ` (${args.join(', ')})` : '') : undefined}
                status={tool.status}
                duration={durationLabel}
                hideDetails
            />
        )
    }

    /* ── Search tools ── */
    if (isSearch) {
        const query = tool.input?.query ? String(tool.input.query) : ''
        const url = tool.input?.url ? String(tool.input.url) : tool.input?.Url ? String(tool.input.Url) : ''
        const isWebFetch = tool.name === 'webfetch' || tool.name === 'read_url_content'

        return (
            <BasicTool
                badge={isWebFetch ? 'FETCH' : 'WEB'}
                trigger={
                    <div className="search-trigger">
                        <span className="search-trigger__title">
                            <TextShimmer text={isWebFetch ? 'Web Fetch' : 'Web Search'} active={pending} />
                        </span>
                        {!pending && (url || query) && (
                            url ? (
                                <a
                                    className="search-trigger__link"
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {url}
                                </a>
                            ) : (
                                <span className="search-trigger__query">{query}</span>
                            )
                        )}
                        {!pending && url && (
                            <span className="search-trigger__ext">Open</span>
                        )}
                    </div>
                }
                status={tool.status}
                hideDetails
            />
        )
    }

    /* ── Code search ── */
    if (isCodeSearch) {
        const query = tool.input?.query ? String(tool.input.query) : ''
        return (
            <BasicTool
                badge="CODE"
                title="Code Search"
                subtitle={!pending ? query : undefined}
                status={tool.status}
                hideDetails
            />
        )
    }

    /* ── Task/Sub-agent ── */
    if (isTask) {
        const subagentType = tool.input?.subagent_type ? String(tool.input.subagent_type) : ''
        const agentLabel = subagentType ? subagentType[0].toUpperCase() + subagentType.slice(1) : 'Agent'
        const desc = tool.input?.description ? String(tool.input.description) : tool.input?.Task ? String(tool.input.Task) : tool.title || ''

        return (
            <BasicTool
                badge="TASK"
                trigger={
                    <div className="agent-trigger">
                        <span className="agent-trigger__title">
                            <TextShimmer text={agentLabel} active={pending} />
                        </span>
                        {!pending && desc && (
                            <span className="agent-trigger__desc">{desc}</span>
                        )}
                    </div>
                }
                status={tool.status}
                hideDetails
            />
        )
    }

    /* ── Skill ── */
    if (isSkill) {
        const skillName = tool.input?.name ? String(tool.input.name) : tool.title || 'Skill'
        return (
            <BasicTool
                badge="SKILL"
                trigger={
                    <div className="skill-trigger">
                        <span className="skill-trigger__title">
                            <TextShimmer text={skillName} active={pending} />
                        </span>
                    </div>
                }
                status={tool.status}
                hideDetails
            />
        )
    }

    /* ── Generic fallback ── */
    const displayTitle = tool.title || tool.name
    return (
        <BasicTool
            badge="TOOL"
            title={displayTitle}
            subtitle={!pending ? extractFilePath(tool.input) || undefined : undefined}
            status={tool.status}
            duration={durationLabel}
        >
            {tool.input && Object.keys(tool.input).length > 0 ? (
                <div className="tool-content-generic">
                    <span className="tool-section-label">Input</span>
                    <pre className="tool-pre">{JSON.stringify(tool.input, null, 2)}</pre>
                </div>
            ) : null}
            {tool.output ? (
                <div className="tool-content-generic">
                    <span className="tool-section-label">Output</span>
                    <pre className="tool-pre">{tool.output.length > 500 ? `${tool.output.slice(0, 500)}…` : tool.output}</pre>
                </div>
            ) : null}
            {isError && tool.error ? (
                <ToolErrorCard error={tool.error} toolName={tool.name} />
            ) : null}
        </BasicTool>
    )
}

/* ═══════════════════════════════════════════════════════
   ContextToolGroup — batched read/glob/grep/list
   ═══════════════════════════════════════════════════════ */

function ContextToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    const [open, setOpen] = useState(false)
    const running = tools.some((t) => t.status === 'running' || t.status === 'pending')
    const errorCount = tools.filter((t) => t.status === 'error').length

    const summary = useMemo(() => {
        const reads = tools.filter(t => t.name === 'read' || t.name === 'read_file' || t.name === 'view_file' || t.name === 'read_many').length
        const searches = tools.filter(t => t.name === 'grep' || t.name === 'grep_search' || t.name === 'find_by_name').length
        const lists = tools.filter(t => t.name === 'list' || t.name === 'list_dir' || t.name === 'glob').length
        const parts: string[] = []
        if (reads > 0) parts.push(`${reads} read${reads > 1 ? 's' : ''}`)
        if (searches > 0) parts.push(`${searches} search${searches > 1 ? 'es' : ''}`)
        if (lists > 0) parts.push(`${lists} list${lists > 1 ? 's' : ''}`)
        return parts.join(', ') || `${tools.length} tool${tools.length > 1 ? 's' : ''}`
    }, [tools])

    return (
        <div className="context-group">
            <button className="context-group__trigger" onClick={() => setOpen(!open)} type="button">
                <span className="context-group__disclosure" aria-hidden="true">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className={`context-group__status-dot${errorCount > 0 ? ' context-group__status-dot--error' : ''}`} />
                <span className="context-group__badge">
                    {running ? 'RUN' : 'CTX'}
                </span>
                <span className="context-group__title">
                    <TextShimmer
                        text={running ? 'Gathering context' : 'Gathered context'}
                        active={running}
                    />
                </span>
                {!running && (
                    <span className="context-group__summary">{summary}</span>
                )}
                {errorCount > 0 && (
                    <span className="context-group__error-badge">{errorCount} error{errorCount > 1 ? 's' : ''}</span>
                )}
            </button>
            {open && (
                <div className="context-group__list">
                    {tools.map((tool) => (
                        <ToolCallRow key={tool.callId} tool={tool} compact />
                    ))}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   TodoInlineList
   ═══════════════════════════════════════════════════════ */

type TodoListItem = { content: string; status: string }

function toTodoListItem(value: unknown): TodoListItem {
    if (value && typeof value === 'object') {
        const r = value as Record<string, unknown>
        return {
            content: typeof r.content === 'string' ? r.content : typeof r.title === 'string' ? r.title : String(value),
            status: typeof r.status === 'string' ? r.status : 'pending',
        }
    }
    return { content: String(value), status: 'pending' }
}

function TodoInlineList({ input, output }: { input?: Record<string, unknown>; output?: string }) {
    let items: TodoListItem[] = []
    if (output) {
        try {
            const parsed = JSON.parse(output)
            if (Array.isArray(parsed)) items = parsed.map(toTodoListItem)
        } catch {
            items = output.split('\n').filter(Boolean).map(line => ({ content: line, status: 'pending' }))
        }
    }
    const sessionTodos = useStudioStore.getState().seTodos
    if (items.length === 0) {
        const allTodos: Todo[] = Object.values(sessionTodos).flat()
        if (allTodos.length > 0) items = allTodos.map(t => ({ content: t.content, status: t.status }))
    }
    if (items.length === 0 && input) {
        return <pre className="tool-pre tool-pre--panel">{JSON.stringify(input, null, 2)}</pre>
    }

    const iconFor = (s: string) => {
        if (s === 'completed') return <span className="todo-inline-status todo-inline-status--completed">DONE</span>
        if (s === 'in_progress') return <span className="todo-inline-status todo-inline-status--active">WORK</span>
        if (s === 'cancelled') return <span className="todo-inline-status todo-inline-status--cancelled">STOP</span>
        return <span className="todo-inline-status">TODO</span>
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

/* ═══════════════════════════════════════════════════════
   ToolGroup — groups consecutive tools with context batching
   ═══════════════════════════════════════════════════════ */

export function ToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    // Partition tools into context groups and non-context tools
    const segments = useMemo(() => {
        const result: Array<{ kind: 'context'; tools: ChatMessageToolInfo[] } | { kind: 'tool'; tool: ChatMessageToolInfo }> = []
        let contextBuffer: ChatMessageToolInfo[] = []

        for (const tool of tools) {
            if (CONTEXT_NAMES.has(tool.name)) {
                contextBuffer.push(tool)
            } else {
                if (contextBuffer.length > 0) {
                    result.push({ kind: 'context', tools: [...contextBuffer] })
                    contextBuffer = []
                }
                result.push({ kind: 'tool', tool })
            }
        }
        if (contextBuffer.length > 0) {
            result.push({ kind: 'context', tools: contextBuffer })
        }

        return result
    }, [tools])

    return (
        <div className="tool-group-v2">
            {segments.map((seg, idx) => {
                if (seg.kind === 'context') {
                    if (seg.tools.length === 1) {
                        return <ToolCallRow key={`ctx-${idx}`} tool={seg.tools[0]} />
                    }
                    return <ContextToolGroup key={`ctxg-${idx}`} tools={seg.tools} />
                }
                return <ToolCallRow key={seg.tool.callId || `t-${idx}`} tool={seg.tool} />
            })}
        </div>
    )
}
