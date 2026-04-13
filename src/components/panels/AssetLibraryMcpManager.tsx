import type { MouseEvent, PointerEvent } from 'react'
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronUp, GripVertical, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import type { McpServer } from '../../types'
import Tip from '../../features/act/Tip'
import { buildMcpDragPayload } from './asset-library-utils'
import {
    cloneMcpDraftEntries,
    createMcpEntryDraft as createBlankMcpEntryDraft,
    isRemoteDraft,
    type McpEntryDraft,
    type McpKVPair,
} from './mcp-catalog-utils'
import type { McpCatalogState } from './useMcpCatalog'

type Props = {
    liveMcps: McpServer[]
    mcpEntries: McpEntryDraft[]
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    runtimeReloadPending: boolean
    pendingMcpAuthName: string | null
    createMcpEntryDraft: McpCatalogState['createMcpEntryDraft']
    saveMcpEntry: McpCatalogState['saveMcpEntry']
    deleteMcpEntry: McpCatalogState['deleteMcpEntry']
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

function cloneEntry(entry: McpEntryDraft) {
    return cloneMcpDraftEntries([entry])[0]
}

function entriesMatch(left: McpEntryDraft, right: McpEntryDraft) {
    return JSON.stringify(left) === JSON.stringify(right)
}

function stopDragTrigger(event: PointerEvent | MouseEvent) {
    event.stopPropagation()
}

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
            {items.map((item, index) => (
                <div key={`${label}-${index}`} className="asset-mcp-list-row">
                    <input
                        className="text-input"
                        value={item}
                        placeholder={placeholder}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = event.target.value
                            onChange(next)
                        }}
                    />
                    <button
                        className="icon-btn"
                        type="button"
                        title="Remove"
                        onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn asset-mcp-list-field__add"
                type="button"
                onClick={() => onChange([...items, ''])}
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
            {items.map((item, index) => (
                <div key={`${label}-${index}`} className="asset-mcp-list-row asset-mcp-list-row--kv">
                    <input
                        className="text-input"
                        value={item.key}
                        placeholder={keyPlaceholder || 'Key'}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = { ...item, key: event.target.value }
                            onChange(next)
                        }}
                    />
                    <input
                        className="text-input"
                        value={item.value}
                        placeholder={valuePlaceholder || 'Value'}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = { ...item, value: event.target.value }
                            onChange(next)
                        }}
                    />
                    <button
                        className="icon-btn"
                        type="button"
                        title="Remove"
                        onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn asset-mcp-list-field__add"
                type="button"
                onClick={() => onChange([...items, { key: '', value: '' }])}
            >
                <Plus size={10} /> {addLabel}
            </button>
        </div>
    )
}

function McpEntryBody({
    entry,
    onChange,
}: {
    entry: McpEntryDraft
    onChange: (entry: McpEntryDraft) => void
}) {
    const update = (updater: (draft: McpEntryDraft) => McpEntryDraft) => onChange(updater(entry))
    const isHttp = entry.transport === 'http'

    return (
        <div className="asset-mcp-editor__body">
            <div className="asset-mcp-tabs">
                <button
                    className={`asset-mcp-tab${entry.transport === 'stdio' ? ' asset-mcp-tab--active' : ''}`}
                    type="button"
                    onClick={() => update((draft) => ({ ...draft, transport: 'stdio' }))}
                >
                    STDIO
                </button>
                <button
                    className={`asset-mcp-tab${isHttp ? ' asset-mcp-tab--active' : ''}`}
                    type="button"
                    onClick={() => update((draft) => ({ ...draft, transport: 'http' }))}
                >
                    Streamable HTTP
                </button>
            </div>

            <div className="asset-mcp-editor__grid">
                <label className="asset-mcp-editor__field">
                    <span>Name</span>
                    <input
                        className="text-input"
                        value={entry.name}
                        placeholder="MCP server name"
                        onChange={(event) => update((draft) => ({ ...draft, name: event.target.value }))}
                    />
                </label>
                <label className="asset-mcp-editor__field">
                    <span>Startup</span>
                    <select
                        className="select"
                        value={entry.enabled ? 'enabled' : 'disabled'}
                        onChange={(event) => update((draft) => ({ ...draft, enabled: event.target.value === 'enabled' }))}
                    >
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </label>
                <label className="asset-mcp-editor__field">
                    <span>Timeout (ms)</span>
                    <input
                        className="text-input"
                        value={entry.timeoutText}
                        placeholder="5000"
                        onChange={(event) => update((draft) => ({ ...draft, timeoutText: event.target.value }))}
                    />
                </label>
            </div>

            {entry.transport === 'stdio' ? (
                <>
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                            <span>Command</span>
                            <input
                                className="text-input"
                                value={entry.command}
                                placeholder="npx"
                                onChange={(event) => update((draft) => ({ ...draft, command: event.target.value }))}
                            />
                        </label>
                    </div>

                    <StringListField
                        label="Arguments"
                        items={entry.args}
                        addLabel="Add argument"
                        onChange={(args) => update((draft) => ({ ...draft, args }))}
                    />

                    <KVListField
                        label="Environment"
                        items={entry.env}
                        addLabel="Add variable"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(env) => update((draft) => ({ ...draft, env }))}
                    />
                </>
            ) : (
                <>
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                            <span>URL</span>
                            <input
                                className="text-input"
                                value={entry.url}
                                placeholder="https://mcp.example.com/mcp"
                                onChange={(event) => update((draft) => ({ ...draft, url: event.target.value }))}
                            />
                        </label>
                    </div>

                    <KVListField
                        label="Headers"
                        items={entry.headers}
                        addLabel="Add header"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(headers) => update((draft) => ({ ...draft, headers }))}
                    />

                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field">
                            <span>OAuth</span>
                            <select
                                className="select"
                                value={entry.oauthEnabled ? 'enabled' : 'disabled'}
                                onChange={(event) => update((draft) => ({ ...draft, oauthEnabled: event.target.value === 'enabled' }))}
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
                                placeholder="client id"
                                onChange={(event) => update((draft) => ({ ...draft, oauthClientId: event.target.value }))}
                            />
                        </label>
                        <label className="asset-mcp-editor__field">
                            <span>Client Secret</span>
                            <input
                                className="text-input"
                                value={entry.oauthClientSecret}
                                placeholder="client secret"
                                onChange={(event) => update((draft) => ({ ...draft, oauthClientSecret: event.target.value }))}
                            />
                        </label>
                        <label className="asset-mcp-editor__field">
                            <span>OAuth Scope</span>
                            <input
                                className="text-input"
                                value={entry.oauthScope}
                                placeholder="repo read:org"
                                onChange={(event) => update((draft) => ({ ...draft, oauthScope: event.target.value }))}
                            />
                        </label>
                    </div>
                </>
            )}
        </div>
    )
}

function describeMcpTransport(entry: McpEntryDraft) {
    return isRemoteDraft(entry) ? 'HTTP' : 'STDIO'
}

function resolveLiveStatus(entry: McpEntryDraft, live: McpServer | null) {
    if (live?.status === 'connected') {
        return 'connected'
    }
    if (entry.enabled === false) {
        return 'disabled'
    }
    return live?.status || 'disconnected'
}

function describeMcpStatus(status: string) {
    switch (status) {
        case 'connected':
            return 'Connected'
        case 'needs_auth':
            return 'Authentication required'
        case 'needs_client_registration':
            return 'OAuth setup required'
        case 'failed':
            return 'Connection failed'
        case 'disabled':
            return 'Startup off'
        default:
            return 'Ready to test'
    }
}

function describeMcpCardSummary({
    entry,
    savedEntry,
    live,
    liveStatus,
    dirty,
}: {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServer | null
    liveStatus: string
    dirty: boolean
}) {
    const entryName = entry.name.trim()
    if (!entryName) return 'Name required'
    if (!savedEntry) return 'Fill in details, then save this server.'
    if (dirty) return 'Unsaved changes'
    if (live?.error) return 'Needs attention'
    if (live?.clientRegistrationRequired) return 'OAuth setup'
    if (liveStatus === 'disabled') return 'Saved with startup off'
    if (liveStatus === 'connected') return 'Ready'
    if (liveStatus === 'needs_auth') return 'Auth needed'
    if (liveStatus === 'failed') return 'Retry connection'
    return 'Ready to connect'
}

function describeMcpDetailTip({
    entry,
    savedEntry,
    live,
    liveStatus,
    dirty,
}: {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServer | null
    liveStatus: string
    dirty: boolean
}) {
    const entryName = entry.name.trim()
    if (!entryName) return 'Add a name before saving this MCP server.'
    if (!savedEntry) return 'This server is only in the editor right now. Save the card to add it to Studio.'
    if (dirty) return 'Test, authenticate, and drag actions always use the saved MCP config. Save this card first.'
    if (live?.error) return live.error
    if (live?.clientRegistrationRequired) {
        return 'This remote MCP needs OAuth client credentials. Save client ID and secret, then authenticate.'
    }
    if (liveStatus === 'disabled') {
        return 'Startup off keeps the server in the library without auto-connecting it. You can still test or connect it later.'
    }
    if (liveStatus === 'needs_auth') {
        return 'Authentication is required before Studio can use this MCP.'
    }
    if (liveStatus === 'failed') {
        return 'The last connection test failed. Check the config and try again.'
    }
    return 'This server is saved and ready for connection tests, auth, and performer assignment.'
}

type McpCardProps = {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServer | null
    isActive: boolean
    isDirty: boolean
    interactionLocked: boolean
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    onEdit: () => void
    onChange: (entry: McpEntryDraft) => void
    onSave: () => Promise<void>
    onDiscard: () => void
    onDelete: () => Promise<void>
    onCollapse: () => void
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

function McpEditableCard({
    entry,
    savedEntry,
    live,
    isActive,
    isDirty,
    interactionLocked,
    mcpCatalogSaving,
    pendingMcpAuthName,
    onEdit,
    onChange,
    onSave,
    onDiscard,
    onDelete,
    onCollapse,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
}: McpCardProps) {
    const entryName = entry.name.trim()
    const liveStatus = resolveLiveStatus(savedEntry || entry, live)
    const transportLabel = describeMcpTransport(entry)
    const savedName = savedEntry?.name.trim() || ''
    const runtimeActionsLocked = !savedEntry || !savedName || isDirty || mcpCatalogSaving
    const authPending = savedName ? pendingMcpAuthName === savedName : false
    const runtimeEntry = savedEntry || null
    const canAuthenticate = !!runtimeEntry && isRemoteDraft(runtimeEntry) && runtimeEntry.oauthEnabled
    const canClearAuth = canAuthenticate
        && !!live
        && (
            live.authStatus === 'needs_auth'
            || live.status === 'connected'
            || live.status === 'disabled'
            || live.status === 'disconnected'
            || live.status === 'failed'
        )
    const dragPayload = useMemo(() => buildMcpDragPayload({
        name: savedName || entryName || 'New MCP Server',
        status: liveStatus,
        tools: live?.tools || [],
        resources: live?.resources || [],
    }), [entryName, live?.resources, live?.tools, liveStatus, savedName])
    const canDrag = !!savedEntry && !!savedName && !isDirty
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-editor-${entry.key}`,
        data: dragPayload,
        disabled: !canDrag,
    })
    const rootDragProps = !isActive && canDrag ? { ...attributes, ...listeners } : {}
    const handleDragProps = isActive && canDrag ? { ...attributes, ...listeners } : {}
    const description = describeMcpCardSummary({
        entry,
        savedEntry,
        live,
        liveStatus,
        dirty: isDirty,
    })
    const detailTip = describeMcpDetailTip({
        entry,
        savedEntry,
        live,
        liveStatus,
        dirty: isDirty,
    })
    const actionTip = !savedEntry
        ? 'Save this card before testing or authenticating.'
        : isDirty
            ? 'Save this card before running server actions.'
            : 'Server actions use the saved MCP config.'
    const authLabel = authPending
        ? 'Waiting…'
        : liveStatus === 'connected'
            ? 'Re-authenticate'
            : liveStatus === 'failed'
                ? 'Retry Auth'
                : 'Authenticate'

    return (
        <div
            ref={setNodeRef}
            className={[
                'asset-card',
                'asset-mcp-editor',
                isDragging ? 'is-dragging asset-mcp-editor--dragging' : '',
                isActive ? 'is-selected asset-mcp-editor--expanded' : '',
                !isActive && canDrag ? 'asset-mcp-editor--card-draggable' : '',
            ].filter(Boolean).join(' ')}
            {...rootDragProps}
        >
            <div className="asset-card__header">
                <button
                    type="button"
                    className={`asset-mcp-editor__drag-handle${canDrag ? '' : ' is-disabled'}`}
                    title={canDrag ? 'Drag onto a performer' : 'Save this server before dragging'}
                    {...handleDragProps}
                >
                    <GripVertical size={10} className="drag-handle" />
                </button>
                <Server size={12} className="asset-icon mcp" />
                <span className="asset-card__name">{entryName || 'New MCP Server'}</span>
                <div className="asset-mcp-editor__header-actions">
                    {isActive ? (
                        savedEntry && !isDirty ? (
                            <button
                                className="asset-mcp-editor__collapse-btn"
                                type="button"
                                title="Close editor"
                                onClick={onCollapse}
                                onPointerDown={stopDragTrigger}
                            >
                                <ChevronUp size={11} />
                                <span>Close</span>
                            </button>
                        ) : (
                            <button
                                className="asset-mcp-editor__collapse-btn"
                                type="button"
                                title={savedEntry ? 'Discard changes' : 'Discard new server'}
                                onClick={onDiscard}
                                onPointerDown={stopDragTrigger}
                            >
                                <span>Discard</span>
                            </button>
                        )
                    ) : (
                        <button
                            className="asset-card__edit-btn"
                            type="button"
                            title={interactionLocked ? 'Save or discard the open server first' : 'Edit server'}
                            onClick={(event) => {
                                event.stopPropagation()
                                onEdit()
                            }}
                            onPointerDown={stopDragTrigger}
                            disabled={interactionLocked}
                        >
                            <Pencil size={11} />
                        </button>
                    )}
                </div>
            </div>

            <div className="asset-card__author">
                <span className={`asset-mcp-editor__status-dot asset-mcp-editor__status-dot--${liveStatus}`} />
                {[transportLabel, savedEntry ? describeMcpStatus(liveStatus) : 'Not saved'].join(' · ')}
            </div>

            <div className="asset-card__desc asset-mcp-editor__desc-row">
                <span>{description}</span>
                <Tip text={detailTip} />
            </div>

            {isActive ? (
                <>
                    {live?.error && !isDirty ? <div className="asset-authoring-hint">{live.error}</div> : null}

                    <McpEntryBody entry={entry} onChange={onChange} />

                    <div className="asset-mcp-editor__footer">
                        <div className="asset-mcp-editor__footer-note">
                            Card actions
                            <Tip text={actionTip} />
                        </div>

                        <div className="asset-mcp-editor__action-stack">
                            <div className="asset-mcp-editor__action-row">
                                <button
                                    className={`btn btn--sm${isDirty || !savedEntry ? ' btn--primary' : ''}`}
                                    type="button"
                                    onClick={() => void onSave()}
                                    onPointerDown={stopDragTrigger}
                                    disabled={mcpCatalogSaving || !isDirty}
                                >
                                    {mcpCatalogSaving ? 'Saving…' : savedEntry ? 'Save Changes' : 'Save Server'}
                                </button>
                                {savedEntry ? (
                                    <button
                                        className="btn btn--sm"
                                        type="button"
                                        onClick={onDiscard}
                                        onPointerDown={stopDragTrigger}
                                        disabled={mcpCatalogSaving || !isDirty}
                                    >
                                        Revert
                                    </button>
                                ) : null}
                                {savedEntry ? (
                                    <button
                                        className="btn btn--danger btn--sm"
                                        type="button"
                                        onClick={() => void onDelete()}
                                        onPointerDown={stopDragTrigger}
                                        disabled={mcpCatalogSaving}
                                    >
                                        Delete
                                    </button>
                                ) : null}
                            </div>

                            <div className="asset-mcp-editor__action-row">
                                <button
                                    className="btn btn--sm"
                                    type="button"
                                    title={runtimeActionsLocked ? actionTip : 'Test connection'}
                                    onClick={() => savedName && void connectMcpServer(savedName)}
                                    onPointerDown={stopDragTrigger}
                                    disabled={runtimeActionsLocked}
                                >
                                    Test Connection
                                </button>
                                {canAuthenticate ? (
                                    <button
                                        className="btn btn--sm"
                                        type="button"
                                        title={runtimeActionsLocked ? actionTip : 'Authenticate'}
                                        onClick={() => savedName && void startMcpAuthFlow(savedName)}
                                        onPointerDown={stopDragTrigger}
                                        disabled={runtimeActionsLocked || authPending}
                                    >
                                        {authLabel}
                                    </button>
                                ) : null}
                                {canClearAuth ? (
                                    <button
                                        className="btn btn--danger btn--sm"
                                        type="button"
                                        title={runtimeActionsLocked ? actionTip : 'Clear auth'}
                                        onClick={() => savedName && void clearMcpAuth(savedName)}
                                        onPointerDown={stopDragTrigger}
                                        disabled={runtimeActionsLocked || authPending}
                                    >
                                        Clear Auth
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    )
}

export default function AssetLibraryMcpManager({
    liveMcps,
    mcpEntries,
    mcpCatalogStatus,
    mcpCatalogSaving,
    runtimeReloadPending,
    pendingMcpAuthName,
    createMcpEntryDraft,
    saveMcpEntry,
    deleteMcpEntry,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
}: Props) {
    const [editorDraft, setEditorDraft] = useState<McpEntryDraft | null>(null)
    const savedEntriesByKey = useMemo(
        () => new Map(mcpEntries.map((entry) => [entry.key, entry])),
        [mcpEntries],
    )
    const activeSavedEntry = editorDraft ? savedEntriesByKey.get(editorDraft.key) || null : null
    const activeBaseline = editorDraft
        ? activeSavedEntry || createBlankMcpEntryDraft(editorDraft.key)
        : null
    const editorDirty = !!editorDraft && !!activeBaseline && !entriesMatch(editorDraft, activeBaseline)
    const renderedEntries = useMemo(() => {
        if (!editorDraft) {
            return mcpEntries
        }

        if (savedEntriesByKey.has(editorDraft.key)) {
            return mcpEntries.map((entry) => entry.key === editorDraft.key ? editorDraft : entry)
        }

        return [editorDraft, ...mcpEntries]
    }, [editorDraft, mcpEntries, savedEntriesByKey])
    const statusMessage = mcpCatalogSaving ? 'Saving MCP changes...' : mcpCatalogStatus
    const runtimePendingMessage = runtimeReloadPending
        ? 'Runtime reload pending. MCP changes apply after current sessions go idle.'
        : null

    const beginNewEntry = () => {
        if (editorDirty) {
            return
        }
        setEditorDraft(createMcpEntryDraft())
    }

    const beginEditEntry = (entry: McpEntryDraft) => {
        if (editorDirty && editorDraft?.key !== entry.key) {
            return
        }
        setEditorDraft(cloneEntry(entry))
    }

    const handleDiscard = () => {
        if (!editorDraft) {
            return
        }

        if (activeSavedEntry) {
            setEditorDraft(cloneEntry(activeSavedEntry))
            return
        }

        setEditorDraft(null)
    }

    const handleSave = async () => {
        if (!editorDraft) {
            return
        }
        await saveMcpEntry(editorDraft)
    }

    const handleDelete = async () => {
        if (!editorDraft) {
            return
        }

        if (!activeSavedEntry) {
            setEditorDraft(null)
            return
        }

        const confirmed = window.confirm(`Delete MCP server '${activeSavedEntry.name.trim() || 'Unnamed MCP'}'?`)
        if (!confirmed) {
            return
        }

        const deleted = await deleteMcpEntry(activeSavedEntry.key)
        if (deleted) {
            setEditorDraft(null)
        }
    }

    const handleCollapse = () => {
        if (editorDirty) {
            return
        }
        setEditorDraft(null)
    }

    return (
        <div className="asset-mcp-manager">
            <div className="asset-authoring-row">
                <button
                    className="btn"
                    type="button"
                    onClick={beginNewEntry}
                    disabled={editorDirty}
                    title={editorDirty ? 'Save or discard the open server first' : 'Create a new MCP server'}
                >
                    <Plus size={10} /> New Server
                </button>
                <div className="asset-authoring-row__note asset-authoring-row__note--compact">
                    Card actions run on saved config.
                    <Tip text="Each MCP card saves independently. Test, auth, and performer drag actions always use the saved server config." />
                </div>
            </div>

            {renderedEntries.length > 0 ? (
                <div className="asset-mcp-editor-list">
                    {renderedEntries.map((entry) => {
                        const savedEntry = savedEntriesByKey.get(entry.key) || null
                        const lookupName = savedEntry?.name.trim() || entry.name.trim()
                        const live = lookupName
                            ? liveMcps.find((server) => server.name === lookupName) || null
                            : null
                        const isActive = editorDraft?.key === entry.key
                        const interactionLocked = !!editorDirty && editorDraft?.key !== entry.key

                        return (
                            <McpEditableCard
                                key={entry.key}
                                entry={entry}
                                savedEntry={savedEntry}
                                live={live}
                                isActive={isActive}
                                isDirty={isActive ? editorDirty : false}
                                interactionLocked={interactionLocked}
                                mcpCatalogSaving={mcpCatalogSaving}
                                pendingMcpAuthName={pendingMcpAuthName}
                                onEdit={() => beginEditEntry(savedEntry || entry)}
                                onChange={setEditorDraft}
                                onSave={handleSave}
                                onDiscard={handleDiscard}
                                onDelete={handleDelete}
                                onCollapse={handleCollapse}
                                connectMcpServer={connectMcpServer}
                                startMcpAuthFlow={startMcpAuthFlow}
                                clearMcpAuth={clearMcpAuth}
                            />
                        )
                    })}
                </div>
            ) : (
                <div className="asset-authoring-hint">No MCP servers yet.</div>
            )}

            {statusMessage ? <div className="asset-authoring-hint">{statusMessage}</div> : null}
            {runtimePendingMessage ? <div className="asset-authoring-hint">{runtimePendingMessage}</div> : null}
        </div>
    )
}
