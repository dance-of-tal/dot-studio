import type { Dispatch, SetStateAction } from 'react'
import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { McpServer } from '../../types'
import type { McpEntryDraft, McpKVPair } from './mcp-catalog-utils'
import { GripVertical, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import { buildMcpDragPayload } from './asset-library-utils'
import { isRemoteDraft } from './mcp-catalog-utils'
import type { McpCatalogState } from './useMcpCatalog'

type Props = {
    liveMcps: McpServer[]
    mcpDraftEntries: McpEntryDraft[]
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    runtimeReloadPending: boolean
    pendingMcpAuthName: string | null
    updateMcpEntry: McpCatalogState['updateMcpEntry']
    addMcpEntry: () => string
    removeMcpEntry: (key: string) => void
    saveMcpCatalog: () => Promise<boolean>
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
    expandedMcpEntries: Record<string, boolean>
    setExpandedMcpEntries: Dispatch<SetStateAction<Record<string, boolean>>>
}

// ── Reusable list field helpers ──────────────────────────────

function StringListField({
    label,
    items,
    addLabel,
    placeholder,
    onChange,
}: {
    label: string
    items: string[]
    addLabel: string
    placeholder?: string
    onChange: (items: string[]) => void
}) {
    return (
        <div className="asset-mcp-list-field">
            <span className="asset-mcp-list-field__label">{label}</span>
            {items.map((item, i) => (
                <div key={i} className="asset-mcp-list-row">
                    <input
                        className="text-input"
                        value={item}
                        placeholder={placeholder}
                        onChange={(e) => {
                            const next = [...items]
                            next[i] = e.target.value
                            onChange(next)
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        className="icon-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            onChange(items.filter((_, j) => j !== i))
                        }}
                        title="Remove"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn"
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px', paddingLeft: 0 }}
                onClick={(e) => {
                    e.stopPropagation()
                    onChange([...items, ''])
                }}
            >
                <Plus size={10} /> {addLabel}
            </button>
        </div>
    )
}

function KVListField({
    label,
    items,
    addLabel,
    keyPlaceholder,
    valuePlaceholder,
    onChange,
}: {
    label: string
    items: McpKVPair[]
    addLabel: string
    keyPlaceholder?: string
    valuePlaceholder?: string
    onChange: (items: McpKVPair[]) => void
}) {
    return (
        <div className="asset-mcp-list-field">
            <span className="asset-mcp-list-field__label">{label}</span>
            {items.map((item, i) => (
                <div key={i} className="asset-mcp-list-row asset-mcp-list-row--kv">
                    <input
                        className="text-input"
                        value={item.key}
                        placeholder={keyPlaceholder || 'Key'}
                        onChange={(e) => {
                            const next = [...items]
                            next[i] = { ...item, key: e.target.value }
                            onChange(next)
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <input
                        className="text-input"
                        value={item.value}
                        placeholder={valuePlaceholder || 'Value'}
                        onChange={(e) => {
                            const next = [...items]
                            next[i] = { ...item, value: e.target.value }
                            onChange(next)
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        className="icon-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            onChange(items.filter((_, j) => j !== i))
                        }}
                        title="Remove"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn"
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px', paddingLeft: 0 }}
                onClick={(e) => {
                    e.stopPropagation()
                    onChange([...items, { key: '', value: '' }])
                }}
            >
                <Plus size={10} /> {addLabel}
            </button>
        </div>
    )
}

// ── Entry body ────────────────────────────────────────────────

function McpEntryBody({
    entry,
    updateMcpEntry,
}: {
    entry: McpEntryDraft
    updateMcpEntry: Props['updateMcpEntry']
}) {
    const update = (updater: (e: McpEntryDraft) => McpEntryDraft) =>
        updateMcpEntry(entry.key, updater)
    const isHttp = entry.transport === 'http'

    return (
        <div className="asset-mcp-editor__body" onClick={(e) => e.stopPropagation()}>
            {/* ── Transport tabs ─────────────────────────── */}
            <div className="asset-mcp-tabs">
                <button
                    className={`asset-mcp-tab${entry.transport === 'stdio' ? ' asset-mcp-tab--active' : ''}`}
                    onClick={() => update((e) => ({ ...e, transport: 'stdio' }))}
                >
                    STDIO
                </button>
                <button
                    className={`asset-mcp-tab${isHttp ? ' asset-mcp-tab--active' : ''}`}
                    onClick={() => update((e) => ({ ...e, transport: 'http' }))}
                >
                    Streamable HTTP
                </button>
            </div>

            {/* ── Common: Name / Timeout ──────────────────── */}
            <div className="asset-mcp-editor__grid">
                <label className="asset-mcp-editor__field">
                    <span>Name</span>
                    <input
                        className="text-input"
                        value={entry.name}
                        placeholder="MCP server name"
                        onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
                    />
                </label>
                <label className="asset-mcp-editor__field">
                    <span>Timeout (ms)</span>
                    <input
                        className="text-input"
                        value={entry.timeoutText}
                        placeholder="5000"
                        onChange={(e) => update((d) => ({ ...d, timeoutText: e.target.value }))}
                    />
                </label>
            </div>

            {/* ── STDIO fields ────────────────────────────── */}
            {entry.transport === 'stdio' && (
                <>
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                            <span>Command to launch</span>
                            <input
                                className="text-input"
                                value={entry.command}
                                placeholder="npx"
                                onChange={(e) => update((d) => ({ ...d, command: e.target.value }))}
                            />
                        </label>
                    </div>

                    <StringListField
                        label="Arguments"
                        items={entry.args}
                        addLabel="Add argument"
                        placeholder=""
                        onChange={(args) => update((d) => ({ ...d, args }))}
                    />

                    <KVListField
                        label="Environment variables"
                        items={entry.env}
                        addLabel="Add environment variable"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(env) => update((d) => ({ ...d, env }))}
                    />
                </>
            )}

            {/* ── Streamable HTTP fields ──────────────────── */}
            {isHttp && (
                <>
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                            <span>URL</span>
                            <input
                                className="text-input"
                                value={entry.url}
                                placeholder="https://mcp.example.com/mcp"
                                onChange={(e) => update((d) => ({ ...d, url: e.target.value }))}
                            />
                        </label>
                    </div>

                    <KVListField
                        label="Headers"
                        items={entry.headers}
                        addLabel="Add header"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(headers) => update((d) => ({ ...d, headers }))}
                    />


                    {/* OAuth section */}
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field">
                            <span>OAuth</span>
                            <select
                                className="select"
                                value={entry.oauthEnabled ? 'enabled' : 'disabled'}
                                onChange={(e) => update((d) => ({ ...d, oauthEnabled: e.target.value === 'enabled' }))}
                            >
                                <option value="enabled">Auto / Configured</option>
                                <option value="disabled">Disabled</option>
                            </select>
                        </label>
                        <label className="asset-mcp-editor__field">
                            <span>Client ID</span>
                            <input
                                className="text-input"
                                value={entry.oauthClientId}
                                onChange={(e) => update((d) => ({ ...d, oauthClientId: e.target.value }))}
                                placeholder="client id"
                            />
                        </label>
                        <label className="asset-mcp-editor__field">
                            <span>Client Secret</span>
                            <input
                                className="text-input"
                                value={entry.oauthClientSecret}
                                onChange={(e) => update((d) => ({ ...d, oauthClientSecret: e.target.value }))}
                                placeholder="client secret"
                            />
                        </label>
                        <label className="asset-mcp-editor__field">
                            <span>OAuth Scope</span>
                            <input
                                className="text-input"
                                value={entry.oauthScope}
                                onChange={(e) => update((d) => ({ ...d, oauthScope: e.target.value }))}
                                placeholder="repo read:org"
                            />
                        </label>
                    </div>
                </>
            )}

        </div>
    )
}

type McpEditableCardProps = {
    entry: McpEntryDraft
    live: McpServer | null
    mcpCatalogDirty: boolean
    pendingMcpAuthName: string | null
    updateMcpEntry: Props['updateMcpEntry']
    removeMcpEntry: Props['removeMcpEntry']
    connectMcpServer: Props['connectMcpServer']
    startMcpAuthFlow: Props['startMcpAuthFlow']
    clearMcpAuth: Props['clearMcpAuth']
    expandedMcpEntries: Props['expandedMcpEntries']
    setExpandedMcpEntries: Props['setExpandedMcpEntries']
    runWithPreparedMcpRuntime: (action: () => Promise<void>) => Promise<void>
}

function describeMcpStatus(status: string) {
    switch (status) {
        case 'connected':
            return 'Connected'
        case 'needs_auth':
            return 'Authentication required'
        case 'needs_client_registration':
            return 'OAuth client setup required'
        case 'failed':
            return 'Connection test failed'
        case 'disconnected':
            return 'Ready to test'
        default:
            return status
    }
}

function McpEditableCard({
    entry,
    live,
    mcpCatalogDirty,
    pendingMcpAuthName,
    updateMcpEntry,
    removeMcpEntry,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
    expandedMcpEntries,
    setExpandedMcpEntries,
    runWithPreparedMcpRuntime,
}: McpEditableCardProps) {
    const liveStatus = live?.status || 'disconnected'
    const remote = isRemoteDraft(entry)
    const transportLabel = remote ? 'remote' : 'local'
    const canAuthenticate = remote && entry.oauthEnabled
    const canClearAuth = remote && entry.oauthEnabled && !!live
        && (live.authStatus === 'needs_auth'
            || live.status === 'connected'
            || live.status === 'disconnected'
            || live.status === 'failed')
    const isExpanded = !!expandedMcpEntries[entry.key]
    const canDrag = !!entry.name.trim() && !mcpCatalogDirty
    const dragTitle = !entry.name.trim()
        ? 'Name and save the server before dragging'
        : mcpCatalogDirty
            ? 'Save MCP changes before dragging'
            : 'Drag onto a performer'
    const statusCopy = describeMcpStatus(liveStatus)
    const subtitle = [
        transportLabel,
        statusCopy,
    ].join(' · ')
    const description = !entry.name.trim()
        ? 'Name this server, save it, then drag it onto a performer to enable it there.'
        : live?.error
        || live?.clientRegistrationRequired
        || 'Drag onto a performer to enable it there.'
    const dragPayload = useMemo(() => buildMcpDragPayload({
        name: entry.name.trim() || 'New MCP Server',
        status: liveStatus,
        tools: live?.tools || [],
        resources: live?.resources || [],
    }), [entry.name, live?.resources, live?.tools, liveStatus])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-editor-${entry.key}`,
        data: dragPayload,
        disabled: !canDrag,
    })
    const toggleExpanded = () => {
        setExpandedMcpEntries((prev) => (
            prev[entry.key]
                ? {}
                : { [entry.key]: true }
        ))
    }

    return (
        <div
            id={`asset-mcp-editor-${entry.key}`}
            ref={setNodeRef}
            className={`asset-card asset-mcp-editor ${isDragging ? 'is-dragging asset-mcp-editor--dragging' : ''} ${isExpanded ? 'is-selected asset-mcp-editor--expanded' : ''}`}
        >
            <div className="asset-card__header">
                <button
                    type="button"
                    className={`asset-mcp-editor__drag-handle${canDrag ? '' : ' is-disabled'}`}
                    title={dragTitle}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size={10} className="drag-handle" />
                </button>
                <Server size={12} className="asset-icon mcp" />
                <span className="asset-card__name">{entry.name.trim() || 'New MCP Server'}</span>
                <div className="asset-mcp-editor__header-actions">
                    <button
                        className="asset-card__edit-btn"
                        aria-expanded={isExpanded}
                        onClick={(e) => {
                            e.stopPropagation()
                            toggleExpanded()
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={isExpanded ? 'Collapse editor' : 'Edit server'}
                    >
                        <Pencil size={11} />
                    </button>
                    <button
                        className="asset-card__delete-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            removeMcpEntry(entry.key)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Remove server"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            </div>
            <div className="asset-card__author">
                <span className={`asset-mcp-editor__status-dot asset-mcp-editor__status-dot--${liveStatus}`} />
                {subtitle}
            </div>
            <div className="asset-card__desc">
                {description}
            </div>

            {isExpanded ? (
                <>
                    {live?.error ? <div className="asset-authoring-hint">{live.error}</div> : null}
                    {live?.clientRegistrationRequired ? (
                        <div className="asset-authoring-hint">
                            OAuth client registration required. Fill client ID and secret in the Studio MCP library, save, then retry.
                        </div>
                    ) : null}

                    <McpEntryBody entry={entry} updateMcpEntry={updateMcpEntry} />

                    <div className="asset-mcp-editor__actions">
                        <button
                            className="btn btn--primary"
                            onClick={() => entry.name.trim() && void runWithPreparedMcpRuntime(() => connectMcpServer(entry.name.trim()))}
                            disabled={!entry.name.trim()}
                        >
                            Test Server
                        </button>
                        {canAuthenticate ? (
                            <button
                                className="btn"
                                onClick={() => entry.name.trim() && void runWithPreparedMcpRuntime(() => startMcpAuthFlow(entry.name.trim()))}
                                disabled={!entry.name.trim()}
                            >
                                {pendingMcpAuthName === entry.name.trim()
                                    ? 'Waiting…'
                                    : liveStatus === 'connected'
                                        ? 'Re-authenticate'
                                        : liveStatus === 'failed'
                                            ? 'Retry Auth'
                                            : 'Authenticate'}
                            </button>
                        ) : null}
                        {canClearAuth ? (
                            <button
                                className="btn"
                                onClick={() => entry.name.trim() && void runWithPreparedMcpRuntime(() => clearMcpAuth(entry.name.trim()))}
                                disabled={!entry.name.trim()}
                            >
                                Clear Auth
                            </button>
                        ) : null}
                    </div>
                </>
            ) : null}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

export default function AssetLibraryMcpManager({
    liveMcps,
    mcpDraftEntries,
    mcpCatalogDirty,
    mcpCatalogStatus,
    mcpCatalogSaving,
    runtimeReloadPending,
    pendingMcpAuthName,
    updateMcpEntry,
    addMcpEntry,
    removeMcpEntry,
    saveMcpCatalog,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
    expandedMcpEntries,
    setExpandedMcpEntries,
}: Props) {
    const statusMessage = mcpCatalogSaving
        ? 'Saving MCP changes...'
        : mcpCatalogStatus

    const runtimePendingMessage = runtimeReloadPending
        ? 'Runtime reload pending. New MCP config will apply on the next run after current sessions go idle.'
        : null

    const runWithPreparedMcpRuntime = async (action: () => Promise<void>) => {
        if (mcpCatalogDirty) {
            const saved = await saveMcpCatalog()
            if (!saved) {
                return
            }
        }
        await action()
    }

    return (
        <div className="asset-mcp-manager">
            <div className="asset-authoring-row">
                <button
                    className="btn"
                    onClick={() => {
                        const key = addMcpEntry()
                        setExpandedMcpEntries({ [key]: true })
                    }}
                >
                    <Plus size={10} /> Add Server
                </button>
                <div className="asset-authoring-row__note">
                    Define Studio MCP servers here, then drag a saved server card onto a performer to enable it there.
                </div>
                <button
                    className="btn"
                    onClick={() => void saveMcpCatalog()}
                    disabled={!mcpCatalogDirty || mcpCatalogSaving}
                    style={{ marginLeft: 'auto' }}
                >
                    {mcpCatalogSaving ? 'Saving…' : 'Save'}
                </button>
            </div>

            {mcpDraftEntries.length > 0 ? (
                <div className="asset-mcp-editor-list">
                    {mcpDraftEntries.map((entry) => {
                        const live = liveMcps.find((server) => server.name === entry.name.trim()) || null
                        return (
                            <McpEditableCard
                                key={entry.key}
                                entry={entry}
                                live={live}
                                mcpCatalogDirty={mcpCatalogDirty}
                                pendingMcpAuthName={pendingMcpAuthName}
                                updateMcpEntry={updateMcpEntry}
                                removeMcpEntry={removeMcpEntry}
                                connectMcpServer={connectMcpServer}
                                startMcpAuthFlow={startMcpAuthFlow}
                                clearMcpAuth={clearMcpAuth}
                                expandedMcpEntries={expandedMcpEntries}
                                setExpandedMcpEntries={setExpandedMcpEntries}
                                runWithPreparedMcpRuntime={runWithPreparedMcpRuntime}
                            />
                        )
                    })}
                </div>
            ) : (
                <div className="asset-authoring-hint">No Studio MCP servers defined yet.</div>
            )}

            {statusMessage ? <div className="asset-authoring-hint">{statusMessage}</div> : null}
            {runtimePendingMessage ? <div className="asset-authoring-hint">{runtimePendingMessage}</div> : null}
        </div>
    )
}
