import { Plus } from 'lucide-react'
import { serializeProjectMcpEntries, isRemoteServer } from '../modals/settings-utils'

type Props = {
    filteredMcps: any[]
    mcpDraftEntries: any[]
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    updateMcpEntry: (key: string, updater: (current: any) => any) => void
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
    setExpandedMcpEntries: (value: any) => void
}

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
                        const remote = isRemoteServer(entry.serverText)
                        const canAuthenticate = remote && (liveStatus === 'needs_auth' || liveStatus === 'failed')
                        const canClearAuth = remote && !!live && (live.authStatus === 'needs_auth' || live.status === 'connected' || live.status === 'failed')
                        const isExpanded = !!expandedMcpEntries[entry.key]

                        return (
                            <div key={entry.key} className="asset-mcp-editor">
                                <div
                                    className="asset-mcp-editor__header"
                                    onClick={() => setExpandedMcpEntries((prev: any) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
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
                                    <div className="asset-mcp-editor__body">
                                        {live?.error ? <div className="asset-authoring-hint">{live.error}</div> : null}
                                        {live?.clientRegistrationRequired ? (
                                            <div className="asset-authoring-hint">
                                                OAuth client registration required. Fill client ID and secret, save, then retry.
                                            </div>
                                        ) : null}

                                        <div className="asset-mcp-editor__grid">
                                            <label className="asset-mcp-editor__field">
                                                <span>Name</span>
                                                <input className="text-input" value={entry.name} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, name: e.target.value }))} placeholder="github" onClick={(e) => e.stopPropagation()} />
                                            </label>
                                            <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                <span>Server</span>
                                                <input className="text-input" value={entry.serverText} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, serverText: e.target.value }))} placeholder="npx -y @mcp/server or https://example.com/mcp" onClick={(e) => e.stopPropagation()} />
                                            </label>
                                            <label className="asset-mcp-editor__field">
                                                <span>Enabled</span>
                                                <select className="select" value={entry.enabled ? 'enabled' : 'disabled'} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, enabled: e.target.value === 'enabled' }))} onClick={(e) => e.stopPropagation()}>
                                                    <option value="enabled">Enabled</option>
                                                    <option value="disabled">Disabled</option>
                                                </select>
                                            </label>
                                            <label className="asset-mcp-editor__field">
                                                <span>Timeout (ms)</span>
                                                <input className="text-input" value={entry.timeoutText} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, timeoutText: e.target.value }))} placeholder="5000" onClick={(e) => e.stopPropagation()} />
                                            </label>
                                        </div>

                                        {!remote ? (
                                            <div className="asset-mcp-editor__grid">
                                                <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                    <span>Environment</span>
                                                    <textarea className="text-input asset-mcp-editor__textarea" value={entry.environmentText} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, environmentText: e.target.value }))} placeholder="GITHUB_TOKEN=..." />
                                                </label>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="asset-mcp-editor__grid">
                                                    <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                        <span>Static Headers</span>
                                                        <textarea className="text-input asset-mcp-editor__textarea" value={entry.headersText} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, headersText: e.target.value }))} placeholder="X-Workspace=demo" />
                                                    </label>
                                                </div>
                                                <div className="asset-mcp-editor__grid">
                                                    <label className="asset-mcp-editor__field">
                                                        <span>OAuth</span>
                                                        <select className="select" value={entry.oauthEnabled ? 'enabled' : 'disabled'} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, oauthEnabled: e.target.value === 'enabled' }))}>
                                                            <option value="enabled">Auto / Configured</option>
                                                            <option value="disabled">Disabled</option>
                                                        </select>
                                                    </label>
                                                    <label className="asset-mcp-editor__field">
                                                        <span>Client ID</span>
                                                        <input className="text-input" value={entry.oauthClientId} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, oauthClientId: e.target.value }))} placeholder="client id" />
                                                    </label>
                                                    <label className="asset-mcp-editor__field">
                                                        <span>Client Secret</span>
                                                        <input className="text-input" value={entry.oauthClientSecret} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, oauthClientSecret: e.target.value }))} placeholder="client secret" />
                                                    </label>
                                                    <label className="asset-mcp-editor__field">
                                                        <span>OAuth Scope</span>
                                                        <input className="text-input" value={entry.oauthScope} onChange={(e) => updateMcpEntry(entry.key, (current: any) => ({ ...current, oauthScope: e.target.value }))} placeholder="repo read:org" />
                                                    </label>
                                                </div>
                                            </>
                                        )}

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
                                    </div>
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
