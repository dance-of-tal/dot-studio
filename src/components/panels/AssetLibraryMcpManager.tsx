import type { Dispatch, SetStateAction } from 'react'
import type { McpServer } from '../../types'
import type { McpKVPair, ProjectMcpEntryDraft } from '../modals/settings-utils'
import { Plus, Trash2 } from 'lucide-react'
import { serializeProjectMcpEntries, isRemoteDraft } from '../modals/settings-utils'
import type { McpCatalogState } from './useMcpCatalog'

type Props = {
    filteredMcps: McpServer[]
    mcpDraftEntries: ProjectMcpEntryDraft[]
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    updateMcpEntry: McpCatalogState['updateMcpEntry']
    addMcpEntry: () => void
    removeMcpEntry: (key: string) => void
    saveMcpCatalog: () => Promise<void>
    resetMcpCatalog: () => void
    connectMcpServer: (name: string) => Promise<void>
    disconnectMcpServer: (name: string) => Promise<void>
    authenticateMcpServer: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
    showMcpRawConfig: boolean
    setShowMcpRawConfig: (value: boolean | ((prev: boolean) => boolean)) => void
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
    entry: ProjectMcpEntryDraft
    updateMcpEntry: Props['updateMcpEntry']
}) {
    const update = (updater: (e: ProjectMcpEntryDraft) => ProjectMcpEntryDraft) =>
        updateMcpEntry(entry.key, updater)
    const isHttp = entry.transport === 'http'

    return (
        <div className="asset-mcp-editor__body" onClick={(e) => e.stopPropagation()}>
            {/* ── Transport tabs ─────────────────────────── */}
            <div className="asset-mcp-tabs">
                <button
                    className={`asset-mcp-tab${!isHttp ? ' asset-mcp-tab--active' : ''}`}
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

            {/* ── Common: Name / Enabled ──────────────────── */}
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
                    <span>Enabled</span>
                    <select
                        className="select"
                        value={entry.enabled ? 'enabled' : 'disabled'}
                        onChange={(e) => update((d) => ({ ...d, enabled: e.target.value === 'enabled' }))}
                    >
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </label>
            </div>

            {/* ── STDIO fields ────────────────────────────── */}
            {!isHttp && (
                <>
                    <div className="asset-mcp-editor__grid">
                        <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                            <span>Command to launch</span>
                            <input
                                className="text-input"
                                value={entry.command}
                                placeholder="openai-dev-mcp serve-sqlite"
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

// ── Main component ────────────────────────────────────────────

export default function AssetLibraryMcpManager({
    filteredMcps,
    mcpDraftEntries,
    mcpCatalogDirty,
    mcpCatalogStatus,
    mcpCatalogSaving,
    pendingMcpAuthName,
    updateMcpEntry,
    addMcpEntry,
    removeMcpEntry,
    saveMcpCatalog,
    resetMcpCatalog,
    connectMcpServer,
    disconnectMcpServer,
    authenticateMcpServer,
    clearMcpAuth,
    showMcpRawConfig,
    setShowMcpRawConfig,
    expandedMcpEntries,
    setExpandedMcpEntries,
}: Props) {
    return (
        <div className="asset-mcp-manager">
            <div className="asset-authoring-row">
                <button className="btn" onClick={() => addMcpEntry()}>
                    <Plus size={10} /> Add Server
                </button>
                <div className="asset-authoring-row__note">
                    Drag connected servers onto performers.
                </div>
            </div>

            {mcpDraftEntries.length > 0 ? (
                <div className="asset-mcp-editor-list">
                    {mcpDraftEntries.map((entry) => {
                        const live = filteredMcps.find((server) => server.name === entry.name.trim()) || null
                        const liveStatus = live?.status || (entry.enabled ? 'disconnected' : 'disabled')
                        const remote = isRemoteDraft(entry)
                        const canAuthenticate = remote && (liveStatus === 'needs_auth' || liveStatus === 'failed')
                        const canClearAuth = remote && !!live && (live.authStatus === 'needs_auth' || live.status === 'connected' || live.status === 'failed')
                        const isExpanded = !!expandedMcpEntries[entry.key]

                        return (
                            <div key={entry.key} className="asset-mcp-editor">
                                <div
                                    className="asset-mcp-editor__header"
                                    onClick={() => setExpandedMcpEntries((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                                >
                                    <div className="asset-mcp-editor__header-left">
                                        <span className={`asset-mcp-editor__status-dot asset-mcp-editor__status-dot--${liveStatus}`} />
                                        <div>
                                            <div className="asset-mcp-editor__title">{entry.name.trim() || 'New MCP Server'}</div>
                                            <div className="asset-mcp-editor__meta">
                                                <span>{remote ? 'remote' : 'local'}</span>
                                                <span>{live?.tools?.length || 0} tools</span>
                                                <span>{live?.resources?.length || 0} resources</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`asset-mcp-editor__status asset-mcp-editor__status--${liveStatus}`}>
                                        {liveStatus}
                                    </span>
                                </div>

                                {isExpanded ? (
                                    <>
                                        {live?.error ? <div className="asset-authoring-hint">{live.error}</div> : null}
                                        {live?.clientRegistrationRequired ? (
                                            <div className="asset-authoring-hint">
                                                OAuth client registration required. Fill client ID and secret, save, then retry.
                                            </div>
                                        ) : null}

                                        <McpEntryBody entry={entry} updateMcpEntry={updateMcpEntry} />

                                        <div className="asset-mcp-editor__actions">
                                            <button className="btn btn--primary" onClick={() => entry.name.trim() && void connectMcpServer(entry.name.trim())} disabled={!entry.name.trim() || !entry.enabled}>Connect</button>
                                            <button className="btn" onClick={() => entry.name.trim() && void disconnectMcpServer(entry.name.trim())} disabled={!entry.name.trim()}>Disconnect</button>
                                            {canAuthenticate ? (
                                                <button className="btn" onClick={() => entry.name.trim() && void authenticateMcpServer(entry.name.trim())} disabled={!entry.name.trim()}>
                                                    {pendingMcpAuthName === entry.name.trim() ? 'Waiting…' : liveStatus === 'failed' ? 'Retry Auth' : 'Authenticate'}
                                                </button>
                                            ) : null}
                                            {canClearAuth ? (
                                                <button className="btn" onClick={() => entry.name.trim() && void clearMcpAuth(entry.name.trim())} disabled={!entry.name.trim()}>
                                                    Clear Auth
                                                </button>
                                            ) : null}
                                            <button className="btn btn--danger" onClick={() => removeMcpEntry(entry.key)}>Remove</button>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="asset-authoring-hint">No MCP servers defined for this project.</div>
            )}

            <div className="asset-mcp-manager__footer">
                <button className={`btn${showMcpRawConfig ? ' btn--active' : ''}`} onClick={() => setShowMcpRawConfig((v: boolean) => !v)} title="Show the raw config.json MCP payload sent to OpenCode">
                    {showMcpRawConfig ? 'Hide Raw' : 'View Raw'}
                </button>
                <button className="btn" onClick={resetMcpCatalog} disabled={!mcpCatalogDirty || mcpCatalogSaving}>Reset</button>
                <button className="btn" onClick={() => void saveMcpCatalog()} disabled={!mcpCatalogDirty || mcpCatalogSaving}>
                    {mcpCatalogSaving ? 'Saving…' : 'Save'}
                </button>
            </div>

            {showMcpRawConfig ? (
                <pre className="asset-mcp-editor__raw-config">
                    {JSON.stringify({ mcp: serializeProjectMcpEntries(mcpDraftEntries) }, null, 2)}
                </pre>
            ) : null}

            {mcpCatalogStatus ? <div className="asset-authoring-hint">{mcpCatalogStatus}</div> : null}
        </div>
    )
}
