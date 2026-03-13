import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Hexagon,
    Zap,
    Search,
    Cpu,
    Server,
    Globe,
    X,
    Users,
    HardDrive,
    FolderOpen,
    GitBranch,
    Plus,
} from 'lucide-react';
import { api } from '../../api';
import {
    useAssetKind,
    useAssets,
    useDotAuthUser,
    useModels,
    queryKeys,
    useRegistrySearch,
    useInstallAsset,
} from '../../hooks/queries';
import './AssetLibrary.css';
import { useStudioStore } from '../../store';


import { slugifyAssetName } from '../../lib/performers';
import type { AssetCard } from '../../types';
import { useMcpCatalog } from './useMcpCatalog';
import { serializeProjectMcpEntries } from '../modals/settings-utils';

import type {
    InstalledKind,
    RuntimeKind,
    AssetScope,
    SourceFilter,
    LocalSection,
    RegistryKind,
    ModelProviderFilter,
    ModelAvailabilityFilter,
} from './asset-library-utils';
import {
    MAX_MODELS_PER_PROVIDER,
    isInstalledAssetKind,
    getAssetUrn,
    getAssetSelectionKey,
    buildMcpHaystack,
    buildDraftAssetCards,
    filterInstalledAssets,
    groupModels,
    buildRegistryGroups,
    buildAuthoringPayloadFromAsset,
    placeholderForLocalSection,
    authoringNoteForInstalledKind,
    labelForInstalledKind,
} from './asset-library-utils';
import {
    DraggableAsset,
    DraggableModel,
    DraggableMcp,
    RegistryResult,
    PinnedDetailPanel,
} from './AssetCards';

export default function AssetLibrary({ onClose }: { onClose?: () => void }) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const drafts = useStudioStore((state) => state.drafts)
    const addPerformer = useStudioStore((state) => state.addPerformer)
    const addAct = useStudioStore((state) => state.addAct)
    const createMarkdownEditor = useStudioStore((state) => state.createMarkdownEditor)
    const selectPerformer = useStudioStore((state) => state.selectPerformer)
    const setActiveChatPerformer = useStudioStore((state) => state.setActiveChatPerformer)
    const [filter, setFilter] = useState('')
    const [scope, setScope] = useState<AssetScope>('local')
    const [localSection, setLocalSection] = useState<LocalSection>('installed')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [installedKind, setInstalledKind] = useState<InstalledKind>('performer')
    const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>('models')
    const [registryKind, setRegistryKind] = useState<RegistryKind>('all')
    const [modelProviderFilter, setModelProviderFilter] = useState<ModelProviderFilter>('popular')
    const [modelAvailabilityFilter, setModelAvailabilityFilter] = useState<ModelAvailabilityFilter>('ready')
    const [registryQuery, setRegistryQuery] = useState('')
    const [searchEnabled, setSearchEnabled] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<any | null>(null)
    const [expandedModelProviders, setExpandedModelProviders] = useState<Record<string, boolean>>({})
    const [expandedMcpEntries, setExpandedMcpEntries] = useState<Record<string, boolean>>({})
    const [showMcpRawConfig, setShowMcpRawConfig] = useState(false)
    const [authoringHint, setAuthoringHint] = useState<string | null>(null)
    const [detailActionStatus, setDetailActionStatus] = useState<string | null>(null)
    const [detailActionLoading, setDetailActionLoading] = useState<null | 'save-local' | 'publish' | 'import'>(null)
    const { data: authUser } = useDotAuthUser()
    const queryClient = useQueryClient()

    const showInstalledAssets = scope === 'local' && localSection === 'installed'
    const showModels = scope === 'local' && localSection === 'runtime' && runtimeKind === 'models'
    const showMcps = scope === 'local' && localSection === 'runtime' && runtimeKind === 'mcps'

    const { data: installedAssets = [], isLoading: assetsLoading } = useAssetKind(installedKind, showInstalledAssets)
    const { data: assetInventory = [] } = useAssets(scope === 'registry')
    const { data: models = [] } = useModels(showModels)
    const { data: registryResults = [], isLoading: registryLoading, error: registryError } = useRegistrySearch(
        registryQuery,
        registryKind,
        searchEnabled,
    )

    // MCP catalog state & operations (extracted to useMcpCatalog hook)
    const mcp = useMcpCatalog(workingDir, showMcps)
    const mcpServers = mcp.mcpServers ?? []
    const {
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
    } = mcp

    const draftAssetCards = useMemo<AssetCard[]>(
        () => buildDraftAssetCards(drafts, installedKind),
        [drafts, installedKind],
    )

    const visibleInstalledAssets = useMemo(
        () => [...draftAssetCards, ...installedAssets],
        [draftAssetCards, installedAssets],
    )

    const installMutation = useInstallAsset()

    useEffect(() => {
        setSelectedAsset(null)
    }, [scope, localSection, installedKind, runtimeKind, registryKind])

    useEffect(() => {
        setAuthoringHint(null)
    }, [scope, localSection, installedKind])

    useEffect(() => {
        setExpandedModelProviders({})
    }, [filter, modelAvailabilityFilter, modelProviderFilter])

    const installedUrns = useMemo(
        () => new Set(assetInventory.map((asset) => getAssetUrn(asset)).filter(Boolean) as string[]),
        [assetInventory],
    )

    const triggerSearch = () => {
        if (registryQuery.trim()) {
            setSearchEnabled(true)
        }
    }

    const handleQueryChange = (value: string) => {
        setRegistryQuery(value)
        setSearchEnabled(false)
    }

    const handleRegistryInstall = async (urn: string, targetScope: 'global' | 'stage') => {
        return installMutation.mutateAsync({ urn, scope: targetScope })
    }

    const createNewPerformerDraftEntry = (kind: 'tal' | 'dance') => {
        createMarkdownEditor(kind)
        setAuthoringHint(`Opened a new ${kind} editor on the canvas.`)
    }

    const createNewPerformer = () => {
        const beforeIds = new Set(performers.map((performer) => performer.id))
        addPerformer(`Performer ${performers.filter((performer) => performer.scope !== 'act-owned').length + 1}`, 80, 80)
        const created = useStudioStore.getState().performers.find((performer) => !beforeIds.has(performer.id))
        if (created) {
            selectPerformer(created.id)
            setActiveChatPerformer(created.id)
            setAuthoringHint(`Created ${created.name}. Configure and publish it from the inspector.`)
        }
    }

    const createNewAct = () => {
        addAct(`Act ${useStudioStore.getState().acts.length + 1}`)
        setAuthoringHint('Created a new act area. Configure and publish it from the inspector.')
    }

    const invalidateInstalledAssetQueries = async (kind: InstalledKind) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }

    const handlePinnedAssetAction = async (asset: any, action: 'save-local' | 'publish') => {
        if (!asset || !isInstalledAssetKind(asset.kind)) {
            return
        }

        try {
            setDetailActionLoading(action)
            setDetailActionStatus(null)
            const payload = buildAuthoringPayloadFromAsset(asset)
            const targetSlug = asset.slug || slugifyAssetName(asset.name)

            if (action === 'save-local') {
                if (!authUser?.username) {
                    throw new Error('Run dot login first to save a local fork under your namespace.')
                }
                const result = await api.dot.saveLocalAsset(asset.kind, targetSlug, payload, authUser.username)
                await invalidateInstalledAssetQueries(asset.kind)
                setDetailActionStatus(result.existed
                    ? `Updated local ${asset.kind} asset at ${result.urn}.`
                    : `Saved local ${asset.kind} asset at ${result.urn}.`)
                return
            }


            const result = await api.dot.publishAsset(asset.kind, targetSlug, payload, Array.isArray(asset.tags) ? asset.tags : [], true)
            await invalidateInstalledAssetQueries(asset.kind)
            setDetailActionStatus(result.published
                ? `Published ${result.urn}.`
                : `${result.urn} already exists in the registry.`)
        } catch (err: any) {
            setDetailActionStatus(err?.message || 'Asset action failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handlePinnedActImport = async (asset: any) => {
        if (!asset || asset.kind !== 'act') {
            return
        }

        try {
            setDetailActionLoading('import')
            setDetailActionStatus(null)
            await useStudioStore.getState().importActFromAsset(asset)
            setDetailActionStatus(`Imported ${asset.name} into the current stage.`)
        } catch (err: any) {
            setDetailActionStatus(err?.message || 'Act import failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const queryText = filter.trim().toLowerCase()

    const filteredInstalledAssets = useMemo(
        () => filterInstalledAssets(visibleInstalledAssets, sourceFilter, queryText),
        [visibleInstalledAssets, queryText, sourceFilter],
    )

    const groupedModels = useMemo(
        () => groupModels(models, queryText, modelAvailabilityFilter, modelProviderFilter),
        [modelAvailabilityFilter, modelProviderFilter, models, queryText],
    )

    const readyModelCount = useMemo(
        () => models.filter((model) => model.connected).length,
        [models],
    )

    const filteredMcps = useMemo(
        () => mcpServers.filter((mcp) => !queryText || buildMcpHaystack(mcp).includes(queryText)),
        [mcpServers, queryText],
    )

    const registryGroups = useMemo(
        () => buildRegistryGroups(registryResults as Array<any>),
        [registryResults],
    )

    const selectedAssetKey = selectedAsset ? getAssetSelectionKey(selectedAsset) : null
    useEffect(() => {
        setDetailActionStatus(null)
        setDetailActionLoading(null)
    }, [selectedAssetKey])
    const selectedInstalled = useMemo(() => {
        if (!selectedAsset) return false
        if (selectedAsset.source && selectedAsset.urn) return true
        const urn = getAssetUrn(selectedAsset)
        return urn ? installedUrns.has(urn) : false
    }, [installedUrns, selectedAsset])

    const installedTabs: Array<{ key: InstalledKind; label: string; icon: React.ReactNode }> = [
        { key: 'performer', label: 'Performer', icon: <Users size={10} /> },
        { key: 'tal', label: 'Tal', icon: <Hexagon size={10} /> },
        { key: 'dance', label: 'Dance', icon: <Zap size={10} /> },
        { key: 'act', label: 'Act', icon: <GitBranch size={10} /> },
    ]

    const runtimeTabs: Array<{ key: RuntimeKind; label: string; icon: React.ReactNode }> = [
        { key: 'models', label: 'Models', icon: <Cpu size={10} /> },
        { key: 'mcps', label: 'MCPs', icon: <Server size={10} /> },
    ]

    const modelProviderTabs: Array<{ key: ModelProviderFilter; label: string }> = [
        { key: 'popular', label: 'Popular' },
        { key: 'anthropic', label: 'Anthropic' },
        { key: 'openai', label: 'OpenAI' },
        { key: 'google', label: 'Google' },
        { key: 'xai', label: 'xAI/Grok' },
        { key: 'other', label: 'Other' },
        { key: 'all', label: 'All' },
    ]

    const modelAvailabilityTabs: Array<{ key: ModelAvailabilityFilter; label: string; count: number }> = [
        { key: 'ready', label: 'Ready', count: readyModelCount },
        { key: 'all', label: 'All', count: models.length },
    ]

    const localPlaceholder = placeholderForLocalSection(localSection, runtimeKind)

    const installedEmptyMessage = `No ${labelForInstalledKind(installedKind).toLowerCase()} assets found.`

    return (
        <div className="assets-panel">
            <div className="drawer-header">
                <span className="drawer-header__title">Asset Library</span>
                {onClose && (
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="scope-selector">
                <button
                    className={`scope-btn ${scope === 'local' ? 'active' : ''}`}
                    onClick={() => setScope('local')}
                >
                    <HardDrive size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Local
                </button>
                <button
                    className={`scope-btn ${scope === 'registry' ? 'active' : ''}`}
                    onClick={() => setScope('registry')}
                >
                    <Globe size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                    Registry
                </button>
            </div>

            {scope === 'local' ? (
                <>
                    <div className="scope-selector asset-scope-selector">
                        <button
                            className={`scope-btn ${localSection === 'installed' ? 'active' : ''}`}
                            onClick={() => setLocalSection('installed')}
                        >
                            Installed Assets
                        </button>
                        <button
                            className={`scope-btn ${localSection === 'runtime' ? 'active' : ''}`}
                            onClick={() => setLocalSection('runtime')}
                        >
                            Runtime
                        </button>
                    </div>

                    <div className="assets-tabs">
                        {(localSection === 'installed' ? installedTabs : runtimeTabs).map((tab) => {
                            const active = localSection === 'installed'
                                ? installedKind === tab.key
                                : runtimeKind === tab.key
                            return (
                                <button
                                    key={tab.key}
                                    className={`asset-tab ${active ? 'active' : ''}`}
                                    onClick={() => {
                                        if (localSection === 'installed') {
                                            setInstalledKind(tab.key as InstalledKind)
                                        } else {
                                            setRuntimeKind(tab.key as RuntimeKind)
                                        }
                                    }}
                                >
                                    {tab.icon}
                                    <span>{tab.label}</span>
                                </button>
                            )
                        })}
                    </div>

                    {localSection === 'installed' && (
                        <div className="sub-scope-row">
                            {(['all', 'global', 'stage', 'draft'] as SourceFilter[]).map((value) => (
                                <button
                                    key={value}
                                    className={`sub-scope-tag ${sourceFilter === value ? 'active' : ''}`}
                                    onClick={() => setSourceFilter(value)}
                                >
                                    {value === 'all' ? 'All' : value === 'global' ? (
                                        <><HardDrive size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Global</>
                                    ) : value === 'draft' ? (
                                        <><Plus size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Draft</>
                                    ) : (
                                        <><FolderOpen size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Stage</>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {localSection === 'installed' && (
                        <div className="asset-authoring-row">
                            {installedKind === 'performer' && (
                                <button className="btn" onClick={createNewPerformer}>
                                    <Plus size={10} /> New Performer
                                </button>
                            )}
                            {installedKind === 'tal' && (
                                <button className="btn" onClick={() => createNewPerformerDraftEntry('tal')}>
                                    <Plus size={10} /> New Tal Draft
                                </button>
                            )}
                            {installedKind === 'dance' && (
                                <button className="btn" onClick={() => createNewPerformerDraftEntry('dance')}>
                                    <Plus size={10} /> New Dance Draft
                                </button>
                            )}
                            {installedKind === 'act' && (
                                <button className="btn" onClick={createNewAct}>
                                    <Plus size={10} /> New Act
                                </button>
                            )}
                            <div className="asset-authoring-row__note">
                                {authoringNoteForInstalledKind(installedKind)}
                            </div>
                        </div>
                    )}

                    <div className="explorer__header">
                        <div className="search-wrapper">
                            <Search size={12} className="icon-muted" />
                            <input
                                className="text-input"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder={localPlaceholder}
                            />
                        </div>
                    </div>

                    {authoringHint && (
                        <div className="asset-authoring-hint">
                            {authoringHint}
                        </div>
                    )}

                    {showMcps && (
                        <div className="asset-mcp-manager">
                            <div className="asset-authoring-row">
                                <button className="btn" onClick={() => addMcpEntry('local')}>
                                    <Plus size={10} /> Local
                                </button>
                                <button className="btn" onClick={() => addMcpEntry('remote')}>
                                    <Plus size={10} /> Remote
                                </button>
                                <div className="asset-authoring-row__note">
                                    Drag connected servers onto performers.
                                </div>
                            </div>

                            {mcpDraftEntries.length > 0 ? (
                                <div className="asset-mcp-editor-list">
                                    {mcpDraftEntries.map((entry) => {
                                        const live = mcpServers.find((server) => server.name === entry.name.trim())
                                        const liveStatus = live?.status || (entry.enabled ? 'disconnected' : 'disabled')
                                        const canAuthenticate = entry.type === 'remote' && (liveStatus === 'needs_auth' || liveStatus === 'failed')
                                        const canClearAuth = entry.type === 'remote' && !!live && (live.authStatus === 'needs_auth' || live.status === 'connected' || live.status === 'failed')
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
                                                                <span>{entry.type}</span>
                                                                <span>{live?.tools?.length || 0} tools</span>
                                                                <span>{live?.resources?.length || 0} resources</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className={`asset-mcp-editor__status asset-mcp-editor__status--${liveStatus}`}>
                                                        {liveStatus}
                                                    </span>
                                                </div>

                                                {isExpanded && (
                                                    <div className="asset-mcp-editor__body">
                                                        {live?.error ? (
                                                            <div className="asset-authoring-hint">{live.error}</div>
                                                        ) : null}
                                                        {live?.clientRegistrationRequired ? (
                                                            <div className="asset-authoring-hint">
                                                                OAuth client registration required. Fill client ID and secret, save, then retry.
                                                            </div>
                                                        ) : null}

                                                        <div className="asset-mcp-editor__grid">
                                                            <label className="asset-mcp-editor__field">
                                                                <span>Name</span>
                                                                <input
                                                                    className="text-input"
                                                                    value={entry.name}
                                                                    onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, name: e.target.value }))}
                                                                    placeholder="github"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </label>
                                                            <label className="asset-mcp-editor__field">
                                                                <span>Type</span>
                                                                <select
                                                                    className="registry-kind-select"
                                                                    value={entry.type}
                                                                    onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, type: e.target.value as 'local' | 'remote' }))}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <option value="local">Local</option>
                                                                    <option value="remote">Remote</option>
                                                                </select>
                                                            </label>
                                                            <label className="asset-mcp-editor__field">
                                                                <span>Enabled</span>
                                                                <select
                                                                    className="registry-kind-select"
                                                                    value={entry.enabled ? 'enabled' : 'disabled'}
                                                                    onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, enabled: e.target.value === 'enabled' }))}
                                                                    onClick={(e) => e.stopPropagation()}
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
                                                                    onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, timeoutText: e.target.value }))}
                                                                    placeholder="5000"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </label>
                                                        </div>

                                                        {entry.type === 'local' ? (
                                                            <div className="asset-mcp-editor__grid">
                                                                <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                                    <span>Command</span>
                                                                    <input
                                                                        className="text-input"
                                                                        value={entry.commandText}
                                                                        onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, commandText: e.target.value }))}
                                                                        placeholder="npx -y @modelcontextprotocol/server-github"
                                                                    />
                                                                </label>
                                                                <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                                    <span>Environment</span>
                                                                    <textarea
                                                                        className="text-input asset-mcp-editor__textarea"
                                                                        value={entry.environmentText}
                                                                        onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, environmentText: e.target.value }))}
                                                                        placeholder="GITHUB_TOKEN=..."
                                                                    />
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="asset-mcp-editor__grid">
                                                                    <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                                        <span>URL</span>
                                                                        <input
                                                                            className="text-input"
                                                                            value={entry.url}
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, url: e.target.value }))}
                                                                            placeholder="https://example.com/mcp"
                                                                        />
                                                                    </label>
                                                                    <label className="asset-mcp-editor__field asset-mcp-editor__field--wide">
                                                                        <span>Static Headers</span>
                                                                        <textarea
                                                                            className="text-input asset-mcp-editor__textarea"
                                                                            value={entry.headersText}
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, headersText: e.target.value }))}
                                                                            placeholder="X-Workspace=demo"
                                                                        />
                                                                    </label>
                                                                </div>
                                                                <div className="asset-mcp-editor__grid">
                                                                    <label className="asset-mcp-editor__field">
                                                                        <span>OAuth</span>
                                                                        <select
                                                                            className="registry-kind-select"
                                                                            value={entry.oauthEnabled ? 'enabled' : 'disabled'}
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, oauthEnabled: e.target.value === 'enabled' }))}
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
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, oauthClientId: e.target.value }))}
                                                                            placeholder="client id"
                                                                        />
                                                                    </label>
                                                                    <label className="asset-mcp-editor__field">
                                                                        <span>Client Secret</span>
                                                                        <input
                                                                            className="text-input"
                                                                            value={entry.oauthClientSecret}
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, oauthClientSecret: e.target.value }))}
                                                                            placeholder="client secret"
                                                                        />
                                                                    </label>
                                                                    <label className="asset-mcp-editor__field">
                                                                        <span>OAuth Scope</span>
                                                                        <input
                                                                            className="text-input"
                                                                            value={entry.oauthScope}
                                                                            onChange={(e) => updateMcpEntry(entry.key, (current) => ({ ...current, oauthScope: e.target.value }))}
                                                                            placeholder="repo read:org"
                                                                        />
                                                                    </label>
                                                                </div>
                                                            </>
                                                        )}

                                                        <div className="asset-mcp-editor__actions">
                                                            <button className="btn btn--primary" onClick={() => entry.name.trim() && void connectMcpServer(entry.name.trim())} disabled={!entry.name.trim() || !entry.enabled}>
                                                                Connect
                                                            </button>
                                                            <button className="btn" onClick={() => entry.name.trim() && void disconnectMcpServer(entry.name.trim())} disabled={!entry.name.trim()}>
                                                                Disconnect
                                                            </button>
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
                                                            <button className="btn btn--danger" onClick={() => removeMcpEntry(entry.key)}>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="asset-authoring-hint">No MCP servers defined for this project.</div>
                            )}

                            <div className="asset-mcp-manager__footer">
                                <button
                                    className={`btn${showMcpRawConfig ? ' btn--active' : ''}`}
                                    onClick={() => setShowMcpRawConfig((v) => !v)}
                                    title="Show the raw config.json MCP payload sent to OpenCode"
                                >
                                    {showMcpRawConfig ? 'Hide Raw' : 'View Raw'}
                                </button>
                                <button className="btn" onClick={resetMcpCatalog} disabled={!mcpCatalogDirty || mcpCatalogSaving}>
                                    Reset
                                </button>
                                <button className="btn" onClick={() => void saveMcpCatalog()} disabled={!mcpCatalogDirty || mcpCatalogSaving}>
                                    {mcpCatalogSaving ? 'Saving…' : 'Save'}
                                </button>
                            </div>

                            {showMcpRawConfig && (
                                <pre className="asset-mcp-editor__raw-config">
                                    {JSON.stringify({ mcp: serializeProjectMcpEntries(mcpDraftEntries) }, null, 2)}
                                </pre>
                            )}

                            {mcpCatalogStatus ? (
                                <div className="asset-authoring-hint">{mcpCatalogStatus}</div>
                            ) : null}
                        </div>
                    )}

                    {showModels && (
                        <>
                            <div className="sub-scope-row">
                                {modelAvailabilityTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        className={`sub-scope-tag ${modelAvailabilityFilter === tab.key ? 'active' : ''}`}
                                        onClick={() => setModelAvailabilityFilter(tab.key)}
                                    >
                                        {tab.label} <span className="sub-scope-tag__count">{tab.count}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="sub-scope-row">
                                {modelProviderTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        className={`sub-scope-tag ${modelProviderFilter === tab.key ? 'active' : ''}`}
                                        onClick={() => setModelProviderFilter(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    <div className="asset-library-body">
                        <div className="assets-list">
                            {showInstalledAssets && (
                                assetsLoading ? <div className="empty-state">Loading...</div> :
                                    filteredInstalledAssets.length === 0 ? <div className="empty-state">{installedEmptyMessage}</div> :
                                        filteredInstalledAssets.map((asset) => (
                                            <DraggableAsset
                                                key={asset.urn}
                                                asset={asset}
                                                selected={selectedAssetKey === getAssetSelectionKey(asset)}
                                                onSelect={setSelectedAsset}
                                            />
                                        ))
                            )}
                            {showModels && (
                                groupedModels.length === 0 ? <div className="empty-state">No models available for this filter.</div> :
                                    groupedModels.map((group) => {
                                        const expanded = !!expandedModelProviders[group.key]
                                        const visibleItems = queryText || expanded
                                            ? group.items
                                            : group.items.slice(0, MAX_MODELS_PER_PROVIDER)
                                        const hiddenCount = group.items.length - visibleItems.length

                                        return (
                                            <div key={group.key} className="asset-group">
                                                <div className="asset-group__header">
                                                    <div className="asset-group__meta">
                                                        <span>{group.label}</span>
                                                        <span className="asset-group__count">{group.items.length}</span>
                                                        {!group.connected && <span className="asset-group__status">Not connected</span>}
                                                    </div>
                                                    {hiddenCount > 0 && (
                                                        <button
                                                            className="asset-group__toggle"
                                                            onClick={() => setExpandedModelProviders((current) => ({
                                                                ...current,
                                                                [group.key]: true,
                                                            }))}
                                                        >
                                                            +{hiddenCount} more
                                                        </button>
                                                    )}
                                                </div>
                                                {visibleItems.map((model) => (
                                                    <DraggableModel
                                                        key={`${model.provider}-${model.id}`}
                                                        model={model}
                                                        selected={selectedAssetKey === getAssetSelectionKey({ kind: 'model', ...model })}
                                                        onSelect={setSelectedAsset}
                                                    />
                                                ))}
                                            </div>
                                        )
                                    })
                            )}
                            {showMcps && (
                                filteredMcps.length === 0 ? <div className="empty-state">No MCP servers connected.</div> :
                                    filteredMcps.map((mcp) => (
                                        <DraggableMcp
                                            key={mcp.name}
                                            mcp={mcp}
                                            selected={selectedAssetKey === getAssetSelectionKey({ kind: 'mcp', ...mcp })}
                                            onSelect={setSelectedAsset}
                                        />
                                    ))
                            )}
                        </div>

                        <PinnedDetailPanel
                            asset={selectedAsset}
                            installed={selectedInstalled}
                            onClose={() => setSelectedAsset(null)}
                            authUser={authUser}
                            actionStatus={detailActionStatus}
                            actionLoading={detailActionLoading}
                            onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local')}
                            onPublish={(asset) => handlePinnedAssetAction(asset, 'publish')}
                            onImportToStage={handlePinnedActImport}
                        />
                    </div>
                </>
            ) : (
                <>
                    <div className="explorer__header">
                        <div className="search-wrapper">
                            <Globe size={12} className="icon-muted" />
                            <input
                                className="text-input"
                                value={registryQuery}
                                onChange={(e) => handleQueryChange(e.target.value)}
                                placeholder="name, author, slug, tag..."
                                onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
                            />
                            <button className="registry-search-btn" onClick={triggerSearch} disabled={registryLoading}>
                                {registryLoading ? '...' : <Search size={12} />}
                            </button>
                        </div>
                    </div>

                    <div className="registry-filters">
                        <select
                            className="registry-kind-select"
                            value={registryKind}
                            onChange={(e) => {
                                setRegistryKind(e.target.value as RegistryKind)
                                setSearchEnabled(false)
                            }}
                        >
                            <option value="all">All Kinds</option>
                            <option value="tal">Tal</option>
                            <option value="dance">Dance</option>
                            <option value="performer">Performer</option>
                            <option value="act">Act</option>
                        </select>
                    </div>

                    {registryKind === 'all' && registryGroups.length > 0 && (
                        <div className="registry-counts">
                            {registryGroups.map((group) => (
                                <span key={group.kind} className="registry-count-chip">
                                    {group.label} {group.items.length}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="asset-library-body">
                        <div className="assets-list">
                            {registryLoading ? (
                                <div className="empty-state">Searching registry...</div>
                            ) : registryResults.length === 0 ? (
                                <div className="empty-state">
                                    {registryError ? (
                                        <span style={{ color: 'var(--tal-color)' }}>{(registryError as Error)?.message || 'Search failed.'}</span>
                                    ) : registryQuery ? 'No results found.' : 'Search the DOT registry to discover and install assets.'}
                                </div>
                            ) : (
                                registryGroups.map((group) => (
                                    <div key={group.kind} className="registry-group">
                                        {registryKind === 'all' && (
                                            <div className="registry-group__header">
                                                {group.label} <span>{group.items.length}</span>
                                            </div>
                                        )}
                                        {group.items.map((item, index) => {
                                            const urn = getAssetUrn(item) || `${item.kind}:${item.author}:${item.name}:${index}`
                                            return (
                                                <RegistryResult
                                                    key={urn}
                                                    item={item}
                                                    installed={installedUrns.has(getAssetUrn(item) || '')}
                                                    selected={selectedAssetKey === getAssetSelectionKey(item)}
                                                    onInstall={handleRegistryInstall}
                                                    onSelect={setSelectedAsset}
                                                />
                                            )
                                        })}
                                    </div>
                                ))
                            )}
                        </div>

                        <PinnedDetailPanel
                            asset={selectedAsset}
                            installed={selectedInstalled}
                            onClose={() => setSelectedAsset(null)}
                            authUser={authUser}
                            actionStatus={detailActionStatus}
                            actionLoading={detailActionLoading}
                            onSaveLocal={(asset) => handlePinnedAssetAction(asset, 'save-local')}
                            onPublish={(asset) => handlePinnedAssetAction(asset, 'publish')}
                            onImportToStage={handlePinnedActImport}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
