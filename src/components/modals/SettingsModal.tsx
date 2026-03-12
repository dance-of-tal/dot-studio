import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw, X } from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import './SettingsModal.css'
import type {
    ProviderCard,
    SettingsTab,
    ProviderListFilter,
    ProviderAuthMethod,
    OauthFlow,
    ConnectedModel,
    ModelPickerState,
    OpenCodeInfo,
    ProjectSettingsDraft,
    ProjectConfigMeta,
} from './settings-utils'
import {
    isPopularProvider,
    providerSupportsApiKey,
    labelForAuthMethod,
    mergeProviders,
    buildProjectDraft,
    isProjectDraftEqual,
} from './settings-utils'

function filterProvidersByListFilter(providers: ProviderCard[], providerFilter: ProviderListFilter) {
    if (providerFilter === 'all') {
        return providers
    }
    if (providerFilter === 'connected') {
        return providers.filter((provider) => provider.connected)
    }
    return providers.filter((provider) => provider.connected || isPopularProvider(provider.id))
}

function buildProviderFilterOptions(providers: ProviderCard[]) {
    return [
        { key: 'popular' as const, label: 'Popular', count: providers.filter((provider) => provider.connected || isPopularProvider(provider.id)).length },
        { key: 'connected' as const, label: 'Connected', count: providers.filter((provider) => provider.connected).length },
        { key: 'all' as const, label: 'All', count: providers.length },
    ]
}

function sortConnectedModels(models: ConnectedModel[], providerId: string) {
    return models
        .filter((model) => model.provider === providerId && model.connected)
        .sort((left, right) => {
            const leftName = left.name || left.id
            const rightName = right.name || right.id
            if (left.toolCall !== right.toolCall) {
                return left.toolCall ? -1 : 1
            }
            return leftName.localeCompare(rightName)
        })
}

function filterModelPickerModels(modelPicker: ModelPickerState) {
    const query = modelPicker.query.trim().toLowerCase()
    return modelPicker.models.filter((model) => {
        if (!query) return true
        return `${model.name} ${model.id}`.toLowerCase().includes(query)
    })
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const selectedPerformerId = useStudioStore((state) => state.selectedPerformerId)
    const setPerformerModel = useStudioStore((state) => state.setPerformerModel)
    const [providers, setProviders] = useState<ProviderCard[]>([])
    const [opencodeInfo, setOpencodeInfo] = useState<OpenCodeInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTick, setRefreshTick] = useState(0)
    const [activeTab, setActiveTab] = useState<SettingsTab>('runtime')
    const [providerFilter, setProviderFilter] = useState<ProviderListFilter>('popular')
    const [oauthFlows, setOauthFlows] = useState<Record<string, OauthFlow>>({})
    const [projectDraft, setProjectDraft] = useState<ProjectSettingsDraft | null>(null)
    const [projectSnapshot, setProjectSnapshot] = useState<ProjectSettingsDraft | null>(null)
    const [projectMeta, setProjectMeta] = useState<ProjectConfigMeta | null>(null)
    const [savingProject, setSavingProject] = useState(false)
    const [projectMessage, setProjectMessage] = useState<string | null>(null)
    const [modelPicker, setModelPicker] = useState<ModelPickerState | null>(null)
    const projectDirtyRef = useRef(false)
    const selectedPerformer = useMemo(
        () => performers.find((performer) => performer.id === selectedPerformerId) || null,
        [performers, selectedPerformerId],
    )

    const projectDirty = useMemo(
        () => !isProjectDraftEqual(projectDraft, projectSnapshot),
        [projectDraft, projectSnapshot],
    )

    const filteredProviders = useMemo(() => {
        return filterProvidersByListFilter(providers, providerFilter)
    }, [providerFilter, providers])

    const providerFilterOptions = useMemo(
        () => buildProviderFilterOptions(providers),
        [providers],
    )

    const visibleModelPickerModels = useMemo(
        () => modelPicker ? filterModelPickerModels(modelPicker) : [],
        [modelPicker],
    )

    useEffect(() => {
        projectDirtyRef.current = projectDirty
    }, [projectDirty])

    useEffect(() => {
        if (!open) {
            return
        }

        let cancelled = false

        const fetchAll = async () => {
            if (providers.length === 0 && !opencodeInfo) {
                setLoading(true)
            }
            setError(null)

            try {
                const [providerRes, authRes, healthRes, projectRes] = await Promise.all([
                    api.providers.list(),
                    api.provider.auth().catch(() => ({})),
                    api.opencodeHealth().catch((err) => ({
                        connected: false,
                        url: '',
                        error: err instanceof Error ? err.message : String(err),
                        restartAvailable: false,
                    })),
                    api.config.getProject().catch(() => ({
                        exists: false,
                        path: `${workingDir}/config.json`,
                        config: {},
                    })),
                ])

                if (cancelled) {
                    return
                }

                const mergedProviders = mergeProviders(providerRes, authRes || {})
                setProviders(mergedProviders)
                setOpencodeInfo(healthRes)
                setProjectMeta({
                    exists: projectRes.exists,
                    path: projectRes.path,
                })

                if (!projectDirtyRef.current || !projectDraft || !projectSnapshot) {
                    const nextDraft = buildProjectDraft(mergedProviders, projectRes.config || {})
                    setProjectDraft(nextDraft)
                    setProjectSnapshot(nextDraft)
                }

                setOauthFlows((current) => {
                    let changed = false
                    const next = { ...current }
                    for (const provider of mergedProviders) {
                        if (provider.connected && next[provider.id]) {
                            delete next[provider.id]
                            changed = true
                        }
                    }
                    return changed ? next : current
                })
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err))
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchAll()

        return () => {
            cancelled = true
        }
    }, [open, refreshTick, workingDir])

    function refreshSettings() {
        setRefreshTick((value) => value + 1)
    }

    if (!open) return null

    function clearProviderFlow(providerId: string) {
        setOauthFlows((current) => {
            const next = { ...current }
            delete next[providerId]
            return next
        })
    }

    function updateProviderFlow(providerId: string, updater: (flow: OauthFlow) => OauthFlow) {
        setOauthFlows((current) => {
            const flow = current[providerId]
            if (!flow) {
                return current
            }
            return {
                ...current,
                [providerId]: updater(flow),
            }
        })
    }

    async function refreshProviderState() {
        queryClient.invalidateQueries({ queryKey: ['models'] })
        refreshSettings()
    }

    async function openModelPicker(providerId: string, providerName: string) {
        const performer = selectedPerformer
        const models = await api.models.list()
        const connectedModels = sortConnectedModels(models, providerId)

        setModelPicker({
            providerId,
            providerName,
            performerId: performer?.id || null,
            performerName: performer?.name || null,
            models: connectedModels,
            query: '',
        })
    }

    async function handleAuthSuccess(providerId: string, providerName: string) {
        clearProviderFlow(providerId)
        await refreshProviderState()
        if (selectedPerformer) {
            await openModelPicker(providerId, providerName)
        } else {
            setProjectMessage(`${providerName} connected. Select a performer to assign a model.`)
        }
    }

    async function waitForBrowserOauth(providerId: string, methodIndex: number) {
        try {
            await api.provider.oauthCallback(providerId, methodIndex)
            const provider = providers.find((entry) => entry.id === providerId)
            await handleAuthSuccess(providerId, provider?.name || providerId)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            updateProviderFlow(providerId, (flow) => ({
                ...flow,
                submitting: false,
                error: message,
            }))
        }
    }

    async function handleAuthMethod(provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) {
        setError(null)
        setProjectMessage(null)
        setActiveTab('providers')

        if (method.type === 'api') {
            openApiKeyFlow(provider, methodIndex, method.label)
            return
        }

        try {
            const authorization = await api.provider.oauthAuthorize(provider.id, methodIndex)
            if (authorization.url) {
                window.open(authorization.url, '_blank', 'noopener,noreferrer')
            }
            setOauthFlows((current) => ({
                ...current,
                [provider.id]: {
                    methodIndex,
                    label: method.label,
                    mode: authorization.method,
                    url: authorization.url,
                    instructions: authorization.instructions || '',
                    code: '',
                    submitting: authorization.method === 'auto',
                },
            }))

            if (authorization.method === 'auto') {
                void waitForBrowserOauth(provider.id, methodIndex)
            } else {
                refreshSettings()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    function openApiKeyFlow(provider: ProviderCard, methodIndex = 0, label = 'API Key') {
        setModelPicker(null)
        setOauthFlows((current) => ({
            ...current,
            [provider.id]: {
                methodIndex,
                label,
                mode: 'api',
                instructions: provider.env.length > 0
                    ? `Paste the credential for ${provider.name}. OpenCode will store it in its auth store for ${provider.env.join(', ')}.`
                    : `Paste the credential for ${provider.name}. OpenCode will store it in its auth store.`,
                code: '',
                submitting: false,
            },
        }))
    }

    async function handleOauthCallback(providerId: string) {
        const flow = oauthFlows[providerId]
        if (!flow || flow.mode !== 'code' || !flow.code.trim()) {
            return
        }

        updateProviderFlow(providerId, (currentFlow) => ({
            ...currentFlow,
            submitting: true,
            error: undefined,
        }))

        try {
            await api.provider.oauthCallback(providerId, flow.methodIndex, flow.code.trim())
            const provider = providers.find((entry) => entry.id === providerId)
            await handleAuthSuccess(providerId, provider?.name || providerId)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            updateProviderFlow(providerId, (currentFlow) => ({
                ...currentFlow,
                submitting: false,
                error: message,
            }))
        }
    }

    async function handleApiAuthSave(providerId: string) {
        const flow = oauthFlows[providerId]
        if (!flow || flow.mode !== 'api' || !flow.code.trim()) {
            return
        }

        updateProviderFlow(providerId, (currentFlow) => ({
            ...currentFlow,
            submitting: true,
            error: undefined,
        }))

        try {
            await api.provider.setAuth(providerId, {
                type: 'api',
                key: flow.code.trim(),
            })
            const provider = providers.find((entry) => entry.id === providerId)
            await handleAuthSuccess(providerId, provider?.name || providerId)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            updateProviderFlow(providerId, (currentFlow) => ({
                ...currentFlow,
                submitting: false,
                error: message,
            }))
        }
    }

    function dismissOauthFlow(providerId: string) {
        clearProviderFlow(providerId)
    }

    async function disconnectProvider(providerId: string, providerName: string) {
        setError(null)
        setProjectMessage(null)
        try {
            await api.provider.clearAuth(providerId)
            clearProviderFlow(providerId)
            setModelPicker((current) => current?.providerId === providerId ? null : current)
            await refreshProviderState()
            setProjectMessage(`${providerName} credentials cleared from OpenCode auth store.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    function applyPickedModel(model: ConnectedModel) {
        if (!modelPicker?.performerId) {
            return
        }
        setPerformerModel(modelPicker.performerId, {
            provider: model.provider,
            modelId: model.id,
        })
        setProjectMessage(`${model.name || model.id} applied to ${modelPicker.performerName || 'the selected performer'}.`)
        setModelPicker(null)
    }

    async function retryBrowserOauth(providerId: string) {
        const flow = oauthFlows[providerId]
        if (!flow || flow.mode !== 'auto') {
            return
        }

        setError(null)
        updateProviderFlow(providerId, (currentFlow) => ({
            ...currentFlow,
            submitting: true,
            error: undefined,
        }))

        void waitForBrowserOauth(providerId, flow.methodIndex)
    }

    function toggleProviderVisibility(providerId: string) {
        setProjectDraft((current) => {
            if (!current) return current
            return {
                ...current,
                visibleProviders: {
                    ...current.visibleProviders,
                    [providerId]: !current.visibleProviders[providerId],
                },
            }
        })
    }

    function resetProjectDraft() {
        if (!projectSnapshot) {
            return
        }
        setProjectDraft(projectSnapshot)
        setProjectMessage(null)
    }

    async function saveProjectSettings() {
        if (!projectDraft) {
            return
        }

        setSavingProject(true)
        setError(null)
        setProjectMessage(null)

        try {
            const disabledProviders = providers
                .filter((provider) => !projectDraft.visibleProviders[provider.id])
                .map((provider) => provider.id)

            await api.config.update({
                share: projectDraft.share,
                username: projectDraft.username,
                disabled_providers: disabledProviders,
                enabled_providers: [],
            })

            setProjectSnapshot(projectDraft)
            setProjectMessage('Saved to OpenCode project config.')
            queryClient.invalidateQueries({ queryKey: ['models'] })
            setRefreshTick((value) => value + 1)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSavingProject(false)
        }
    }

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h3>Settings</h3>
                    <div className="settings-header-actions">
                        <button
                            className="icon-btn"
                            onClick={refreshSettings}
                            aria-label="Refresh settings"
                        >
                            <RefreshCw size={14} />
                        </button>
                        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="figma-empty" style={{ padding: 32 }}>Loading...</div>
                ) : (
                    <div className="settings-body">
                        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
                            <button
                                className={`settings-tab ${activeTab === 'runtime' ? 'active' : ''}`}
                                onClick={() => setActiveTab('runtime')}
                                role="tab"
                                aria-selected={activeTab === 'runtime'}
                            >
                                Runtime
                            </button>
                            <button
                                className={`settings-tab ${activeTab === 'project' ? 'active' : ''}`}
                                onClick={() => setActiveTab('project')}
                                role="tab"
                                aria-selected={activeTab === 'project'}
                            >
                                Project
                            </button>
                            <button
                                className={`settings-tab ${activeTab === 'providers' ? 'active' : ''}`}
                                onClick={() => setActiveTab('providers')}
                                role="tab"
                                aria-selected={activeTab === 'providers'}
                            >
                                Providers
                            </button>
                        </div>

                        {error && (
                            <section className="settings-section">
                                <div className="settings-note settings-note--error">{error}</div>
                            </section>
                        )}

                        {activeTab === 'runtime' && (
                            <>
                                <section className="settings-section">
                                    <div className="settings-section-head">
                                        <h4>OpenCode Connection</h4>
                                        {opencodeInfo?.mode === 'managed' && opencodeInfo.restartAvailable && (
                                            <button
                                                className="settings-action-btn"
                                                onClick={async () => {
                                                    setError(null)
                                                    try {
                                                        await api.opencodeRestart()
                                                        refreshSettings()
                                                    } catch (err) {
                                                        setError(err instanceof Error ? err.message : String(err))
                                                    }
                                                }}
                                            >
                                                Restart OpenCode
                                            </button>
                                        )}
                                    </div>
                                    <div className="settings-row">
                                        <span className="settings-label">Status</span>
                                        <span className="settings-value">
                                            {opencodeInfo?.connected
                                                ? <><CheckCircle size={12} color="#14AE5C" /> Connected</>
                                                : <><AlertCircle size={12} color="#F24822" /> Disconnected</>
                                            }
                                        </span>
                                    </div>
                                    <div className="settings-row">
                                        <span className="settings-label">Mode</span>
                                        <span className="settings-value">
                                            {opencodeInfo?.mode === 'external' ? 'External OpenCode' : 'Managed by Studio'}
                                        </span>
                                    </div>
                                    {opencodeInfo?.url && (
                                        <div className="settings-row settings-row--stacked">
                                            <span className="settings-label">URL</span>
                                            <span className="settings-value mono">{opencodeInfo.url}</span>
                                        </div>
                                    )}
                                    {opencodeInfo?.project?.worktree && (
                                        <div className="settings-row settings-row--stacked">
                                            <span className="settings-label">Project</span>
                                            <span className="settings-value mono">{opencodeInfo.project.worktree}</span>
                                        </div>
                                    )}
                                    {opencodeInfo?.error && (
                                        <div className="settings-note settings-note--error">{opencodeInfo.error}</div>
                                    )}
                                    {opencodeInfo?.mode === 'managed' && !opencodeInfo.restartAvailable && (
                                        <div className="settings-note">
                                            Studio is attached to an existing OpenCode daemon that it did not spawn itself. Provider refresh still works, but restarting that daemon has to happen outside Studio.
                                        </div>
                                    )}
                                </section>

                                <section className="settings-section">
                                    <h4>About</h4>
                                    <div className="settings-row">
                                        <span className="settings-label">Studio API</span>
                                        <span className="settings-value mono">
                                            {typeof window === 'undefined' ? '/api' : `${window.location.origin}/api`}
                                        </span>
                                    </div>
                                    <div className="settings-row">
                                        <span className="settings-label">Frontend</span>
                                        <span className="settings-value mono">
                                            {typeof window === 'undefined' ? 'Unavailable' : window.location.origin}
                                        </span>
                                    </div>
                                </section>
                            </>
                        )}

                        {activeTab === 'project' && (
                            <section className="settings-section">
                                <div className="settings-section-head">
                                    <h4>OpenCode Project Controls</h4>
                                    <span className="settings-caption">
                                        Saved through OpenCode into the current working directory.
                                    </span>
                                </div>

                                {projectMeta && (
                                    <div className="settings-row settings-row--stacked">
                                        <span className="settings-label">Config File</span>
                                        <span className="settings-value mono">{projectMeta.path}</span>
                                    </div>
                                )}

                                <div className="settings-form-grid">
                                    <label className="settings-field">
                                        <span className="settings-field__label">Share mode</span>
                                        <select
                                            className="settings-select"
                                            value={projectDraft?.share || 'manual'}
                                            onChange={(e) => setProjectDraft((current) => current ? {
                                                ...current,
                                                share: e.target.value as 'manual' | 'auto' | 'disabled',
                                            } : current)}
                                        >
                                            <option value="manual">Manual</option>
                                            <option value="auto">Auto</option>
                                            <option value="disabled">Disabled</option>
                                        </select>
                                    </label>

                                    <label className="settings-field">
                                        <span className="settings-field__label">Username</span>
                                        <input
                                            className="settings-input"
                                            value={projectDraft?.username || ''}
                                            onChange={(e) => setProjectDraft((current) => current ? {
                                                ...current,
                                                username: e.target.value,
                                            } : current)}
                                            placeholder="Display name for OpenCode sessions"
                                        />
                                    </label>
                                </div>

                                <div className="settings-note">
                                    <div className="settings-note__title">Provider visibility</div>
                                    Hide providers you do not want surfaced in this project. This is the cleanest way to reduce the model list in Studio.
                                </div>

                                <div className="settings-note">
                                    <div className="settings-note__title">Project MCP servers</div>
                                    Manage MCP definitions, authentication, and connection state from the Asset Library MCP section.
                                </div>

                                <div className="settings-checkbox-list">
                                    {providers.map((provider) => (
                                        <label key={provider.id} className="settings-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={projectDraft?.visibleProviders[provider.id] ?? true}
                                                onChange={() => toggleProviderVisibility(provider.id)}
                                            />
                                            <span className="settings-checkbox__body">
                                                <span className="settings-checkbox__title">{provider.name}</span>
                                                <span className="settings-checkbox__meta">
                                                    {provider.id} · {provider.modelCount} models · {provider.connected ? 'connected' : 'not connected'}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                <div className="settings-save-row">
                                    <button
                                        className="settings-action-btn"
                                        onClick={resetProjectDraft}
                                        disabled={!projectDirty || savingProject}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        className="settings-action-btn settings-action-btn--primary"
                                        onClick={saveProjectSettings}
                                        disabled={!projectDirty || savingProject}
                                    >
                                        {savingProject ? 'Saving...' : projectMeta?.exists ? 'Update project config' : 'Create project config'}
                                    </button>
                                </div>

                                {projectMessage && (
                                    <div className="settings-note settings-note--success">{projectMessage}</div>
                                )}
                            </section>
                        )}

                        {activeTab === 'providers' && (
                            <section className="settings-section">
                                <div className="settings-section-head">
                                    <h4>Provider Access</h4>
                                    <span className="settings-caption">
                                        Studio uses OpenCode provider auth directly. Browser OAuth waits for the callback automatically, and API key entry is written into OpenCode's auth store.
                                    </span>
                                </div>

                                <div className="settings-filter-row" role="tablist" aria-label="Provider filters">
                                    {providerFilterOptions.map((filter) => (
                                        <button
                                            key={filter.key}
                                            className={`settings-filter-chip ${providerFilter === filter.key ? 'active' : ''}`}
                                            onClick={() => setProviderFilter(filter.key)}
                                            role="tab"
                                            aria-selected={providerFilter === filter.key}
                                        >
                                            {filter.label}
                                            <span className="settings-filter-chip__count">{filter.count}</span>
                                        </button>
                                    ))}
                                </div>

                                {modelPicker && (
                                    <div className="settings-note settings-note--success">
                                        <div className="settings-note__title">Finish Setup</div>
                                        {modelPicker.performerId
                                            ? `${modelPicker.providerName} is connected. Pick a model for ${modelPicker.performerName || 'the selected performer'}.`
                                            : `${modelPicker.providerName} is connected. Select a performer to assign a model.`}
                                        {modelPicker.performerId && (
                                            <div className="provider-model-picker">
                                                <input
                                                    className="settings-input"
                                                    value={modelPicker.query}
                                                    onChange={(e) => setModelPicker((current) => current ? {
                                                        ...current,
                                                        query: e.target.value,
                                                    } : current)}
                                                    placeholder={`Search ${modelPicker.providerName} models`}
                                                />
                                                <div className="provider-model-picker__list">
                                                    {visibleModelPickerModels
                                                        .slice(0, 16)
                                                        .map((model) => (
                                                            <button
                                                                key={`${model.provider}:${model.id}`}
                                                                className="provider-model-option"
                                                                onClick={() => applyPickedModel(model)}
                                                            >
                                                                <span className="provider-model-option__name">{model.name || model.id}</span>
                                                                <span className="provider-model-option__meta">
                                                                    {model.id}
                                                                    {model.toolCall ? ' · tools' : ''}
                                                                    {model.reasoning ? ' · reasoning' : ''}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    {visibleModelPickerModels.length === 0 && (
                                                            <div className="settings-note settings-note--muted">
                                                                No connected models matched this search.
                                                            </div>
                                                        )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {filteredProviders.length === 0 ? (
                                    <div className="figma-empty" style={{ padding: 12 }}>
                                        No provider information available.
                                    </div>
                                ) : (
                                    <div className="provider-list">
                                        {filteredProviders.map((provider) => {
                                            const flow = oauthFlows[provider.id]
                                            const oauthMethods = provider.authMethods
                                                .map((method, methodIndex) => ({ method, methodIndex }))
                                                .filter(({ method }) => method.type === 'oauth')
                                            const supportsApiAuth = providerSupportsApiKey(provider)

                                            return (
                                                <div key={provider.id} className="provider-card">
                                                    <div className="provider-card__header">
                                                        <div>
                                                            <div className="provider-card__title">{provider.name}</div>
                                                            <div className="provider-card__meta">
                                                                <span>{provider.id}</span>
                                                                <span>{provider.modelCount} models</span>
                                                                {provider.defaultModel && <span>default: {provider.defaultModel}</span>}
                                                                {supportsApiAuth && <span>API key</span>}
                                                                {oauthMethods.length > 0 && <span>OAuth</span>}
                                                            </div>
                                                        </div>
                                                        <span className={`provider-status ${provider.connected ? 'connected' : flow ? 'pending' : 'idle'}`}>
                                                            {provider.connected ? 'Connected' : flow ? 'Pending' : 'Setup needed'}
                                                        </span>
                                                    </div>

                                                    {(supportsApiAuth || oauthMethods.length > 0 || provider.connected) && (
                                                        <div className="provider-actions">
                                                            {supportsApiAuth && (
                                                                <button
                                                                    className="settings-action-btn settings-action-btn--primary"
                                                                    onClick={() => openApiKeyFlow(provider)}
                                                                >
                                                                    Enter API Key
                                                                </button>
                                                            )}
                                                            {provider.connected && selectedPerformer && (
                                                                <button
                                                                    className="settings-action-btn"
                                                                    onClick={() => openModelPicker(provider.id, provider.name)}
                                                                >
                                                                    Choose Model
                                                                </button>
                                                            )}
                                                            {provider.connected && (
                                                                <button
                                                                    className="settings-action-btn"
                                                                    onClick={() => disconnectProvider(provider.id, provider.name)}
                                                                >
                                                                    Disconnect
                                                                </button>
                                                            )}
                                                            {oauthMethods.map(({ method, methodIndex }) => (
                                                                <button
                                                                    key={`${provider.id}-${method.label}-${methodIndex}`}
                                                                    className="settings-action-btn"
                                                                    onClick={() => handleAuthMethod(provider, methodIndex, method)}
                                                                >
                                                                    <ExternalLink size={12} />
                                                                    {labelForAuthMethod(method)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {provider.env.length > 0 && (
                                                        <div className="settings-note">
                                                            <div className="settings-note__title">Credential target</div>
                                                            OpenCode expects: {provider.env.join(', ')}
                                                        </div>
                                                    )}

                                                    {flow && (
                                                        <div className="oauth-flow">
                                                            <div className="oauth-flow__header">
                                                                <span className="oauth-flow__title">{flow.label}</span>
                                                                <button className="icon-btn" onClick={() => dismissOauthFlow(provider.id)}>
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                            <div className="settings-note">
                                                                {flow.instructions || 'Complete authorization in the opened browser window.'}
                                                            </div>
                                                            {flow.mode === 'code' || flow.mode === 'api' ? (
                                                                <div className="oauth-code">
                                                                    <input
                                                                        className="settings-input"
                                                                        value={flow.code}
                                                                        onChange={(e) => {
                                                                            const code = e.target.value
                                                                            setOauthFlows((current) => ({
                                                                                ...current,
                                                                                [provider.id]: {
                                                                                    ...flow,
                                                                                    code,
                                                                                    error: undefined,
                                                                                },
                                                                            }))
                                                                        }}
                                                                        placeholder={flow.mode === 'api' ? 'Paste credential' : 'Paste authorization code'}
                                                                        type={flow.mode === 'api' ? 'password' : 'text'}
                                                                    />
                                                                    <button
                                                                        className="settings-action-btn settings-action-btn--primary"
                                                                        onClick={() => flow.mode === 'api'
                                                                            ? handleApiAuthSave(provider.id)
                                                                            : handleOauthCallback(provider.id)}
                                                                        disabled={flow.submitting || !flow.code.trim()}
                                                                    >
                                                                        {flow.submitting ? 'Submitting...' : flow.mode === 'api' ? 'Save credential' : 'Submit code'}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="settings-note settings-note--muted">
                                                                        {flow.submitting
                                                                            ? 'Browser auth is waiting for OpenCode to receive the callback.'
                                                                            : 'Browser auth is paused. Retry waiting for the callback or reopen the auth window.'}
                                                                    </div>
                                                                    <div className="provider-actions">
                                                                        {flow.url && (
                                                                            <button
                                                                                className="settings-action-btn"
                                                                                onClick={() => window.open(flow.url, '_blank', 'noopener,noreferrer')}
                                                                            >
                                                                                <ExternalLink size={12} />
                                                                                Open browser auth again
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            className="settings-action-btn settings-action-btn--primary"
                                                                            onClick={() => retryBrowserOauth(provider.id)}
                                                                            disabled={flow.submitting}
                                                                        >
                                                                            {flow.submitting
                                                                                ? 'Waiting for callback...'
                                                                                : 'Retry callback wait'}
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            )}
                                                            {flow.error && (
                                                                <div className="settings-note settings-note--error">{flow.error}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                    </div>
                )}
            </div>
        </div>
    )
}
