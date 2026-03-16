import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, RefreshCw, Settings, X, Sliders, Server, Cpu, FolderCog, LayoutGrid } from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import './SettingsModal.css'
import { useProviderAuth } from './useProviderAuth'
import type {
    ProviderCard,
    OpenCodeInfo,
    ProjectSettingsDraft,
    ProjectConfigMeta,
} from './settings-utils'
import {
    mergeProviders,
    buildProjectDraft,
    isProjectDraftEqual,
} from './settings-utils'

import SettingsGeneral from './SettingsGeneral'
import SettingsProviders from './SettingsProviders'
import SettingsModels from './SettingsModels'

type SettingsTab = 'general' | 'providers' | 'models' | 'opencode' | 'project'

interface SidebarSection {
    label: string
    items: { key: SettingsTab; label: string; icon: React.ReactNode }[]
}

const SECTIONS: SidebarSection[] = [
    {
        label: 'Studio',
        items: [
            { key: 'general', label: 'General', icon: <Sliders size={14} /> },
        ],
    },
    {
        label: 'Server',
        items: [
            { key: 'providers', label: 'Providers', icon: <Server size={14} /> },
            { key: 'models', label: 'Models', icon: <LayoutGrid size={14} /> },
        ],
    },
    {
        label: 'Runtime',
        items: [
            { key: 'opencode', label: 'OpenCode', icon: <Cpu size={14} /> },
            { key: 'project', label: 'Project', icon: <FolderCog size={14} /> },
        ],
    },
]

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
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [projectDraft, setProjectDraft] = useState<ProjectSettingsDraft | null>(null)
    const [projectSnapshot, setProjectSnapshot] = useState<ProjectSettingsDraft | null>(null)
    const [projectMeta, setProjectMeta] = useState<ProjectConfigMeta | null>(null)
    const [savingProject, setSavingProject] = useState(false)
    const [projectMessage, setProjectMessage] = useState<string | null>(null)
    const projectDirtyRef = useRef(false)

    const selectedPerformer = useMemo(
        () => performers.find((p) => p.id === selectedPerformerId) || null,
        [performers, selectedPerformerId],
    )

    function refreshSettings() {
        setRefreshTick((v) => v + 1)
    }

    async function refreshProviderState() {
        queryClient.invalidateQueries({ queryKey: ['models'] })
        refreshSettings()
    }

    const auth = useProviderAuth({
        providers,
        selectedPerformer: selectedPerformer ? { id: selectedPerformer.id, name: selectedPerformer.name } : null,
        setPerformerModel,
        refreshProviderState,
        setError,
        setProjectMessage,
        setActiveTab: (tab) => setActiveTab(tab as SettingsTab),
    })

    const projectDirty = useMemo(
        () => !isProjectDraftEqual(projectDraft, projectSnapshot),
        [projectDraft, projectSnapshot],
    )

    useEffect(() => {
        projectDirtyRef.current = projectDirty
    }, [projectDirty])

    useEffect(() => {
        if (!open) return

        let cancelled = false

        const fetchAll = async () => {
            if (providers.length === 0 && !opencodeInfo) setLoading(true)
            setError(null)

            try {
                const [providerRes, authRes, healthRes, projectRes] = await Promise.all([
                    api.providers.list(),
                    api.provider.auth().catch(() => ({})),
                    api.opencodeHealth().catch((err) => ({
                        connected: false, url: '', error: err instanceof Error ? err.message : String(err), restartAvailable: false,
                    })),
                    api.config.getProject().catch(() => ({
                        exists: false, path: `${workingDir}/config.json`, config: {},
                    })),
                ])

                if (cancelled) return

                const mergedProviders = mergeProviders(providerRes, authRes || {})
                setProviders(mergedProviders)
                setOpencodeInfo(healthRes)
                setProjectMeta({ exists: projectRes.exists, path: projectRes.path })

                if (!projectDirtyRef.current || !projectDraft || !projectSnapshot) {
                    const nextDraft = buildProjectDraft(mergedProviders, projectRes.config || {})
                    setProjectDraft(nextDraft)
                    setProjectSnapshot(nextDraft)
                }

                auth.syncFlowsWithProviders(mergedProviders)
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err))
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchAll()
        return () => { cancelled = true }
    }, [open, refreshTick, workingDir])

    if (!open) return null

    function toggleProviderVisibility(providerId: string) {
        setProjectDraft((cur) => {
            if (!cur) return cur
            return {
                ...cur,
                visibleProviders: { ...cur.visibleProviders, [providerId]: !cur.visibleProviders[providerId] },
            }
        })
    }

    function resetProjectDraft() {
        if (!projectSnapshot) return
        setProjectDraft(projectSnapshot)
        setProjectMessage(null)
    }

    async function saveProjectSettings() {
        if (!projectDraft) return
        setSavingProject(true)
        setError(null)
        setProjectMessage(null)

        try {
            const disabledProviders = providers
                .filter((p) => !projectDraft.visibleProviders[p.id])
                .map((p) => p.id)

            await api.config.update({
                share: projectDraft.share,
                username: projectDraft.username,
                disabled_providers: disabledProviders,
                enabled_providers: [],
            })

            setProjectSnapshot(projectDraft)
            setProjectMessage('Saved to OpenCode project config.')
            queryClient.invalidateQueries({ queryKey: ['models'] })
            setRefreshTick((v) => v + 1)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSavingProject(false)
        }
    }

    function renderContent() {
        if (loading && activeTab !== 'general') {
            return <div className="stg-empty">Loading…</div>
        }

        switch (activeTab) {
            case 'general':
                return <SettingsGeneral />

            case 'providers':
                return (
                    <SettingsProviders
                        providers={providers}
                        oauthFlows={auth.oauthFlows}
                        setOauthFlows={auth.setOauthFlows}
                        modelPicker={auth.modelPicker}
                        setModelPicker={auth.setModelPicker}
                        visibleModelPickerModels={auth.visibleModelPickerModels}
                        openApiKeyFlow={auth.openApiKeyFlow}
                        handleAuthMethod={auth.handleAuthMethod}
                        handleOauthCallback={auth.handleOauthCallback}
                        handleApiAuthSave={auth.handleApiAuthSave}
                        dismissOauthFlow={auth.dismissOauthFlow}
                        disconnectProvider={auth.disconnectProvider}
                        openModelPicker={auth.openModelPicker}
                        applyPickedModel={auth.applyPickedModel}
                        retryBrowserOauth={auth.retryBrowserOauth}
                        selectedPerformer={selectedPerformer ? { id: selectedPerformer.id, name: selectedPerformer.name } : null}
                        projectMessage={projectMessage}
                    />
                )

            case 'models':
                return <SettingsModels />

            case 'opencode':
                return (
                    <div className="stg-panel">
                        <div className="stg-panel__header">
                            <h2 className="stg-panel__title">OpenCode</h2>
                        </div>

                        <section className="settings-section">
                            <div className="settings-section-head">
                                <h4>Connection</h4>
                                {opencodeInfo?.mode === 'managed' && opencodeInfo.restartAvailable && (
                                    <button
                                        className="btn"
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
                                        : <><AlertCircle size={12} color="#F24822" /> Disconnected</>}
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
                    </div>
                )

            case 'project':
                return (
                    <div className="stg-panel">
                        <div className="stg-panel__header">
                            <h2 className="stg-panel__title">Project</h2>
                        </div>

                        <section className="settings-section">
                            <div className="settings-section-head">
                                <h4>OpenCode Project Config</h4>
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
                                        className="select"
                                        value={projectDraft?.share || 'manual'}
                                        onChange={(e) => setProjectDraft((cur) => cur ? {
                                            ...cur, share: e.target.value as 'manual' | 'auto' | 'disabled',
                                        } : cur)}
                                    >
                                        <option value="manual">Manual</option>
                                        <option value="auto">Auto</option>
                                        <option value="disabled">Disabled</option>
                                    </select>
                                </label>

                                <label className="settings-field">
                                    <span className="settings-field__label">Username</span>
                                    <input
                                        className="input"
                                        value={projectDraft?.username || ''}
                                        onChange={(e) => setProjectDraft((cur) => cur ? {
                                            ...cur, username: e.target.value,
                                        } : cur)}
                                        placeholder="Display name for OpenCode sessions"
                                    />
                                </label>
                            </div>

                            <div className="settings-note">
                                <div className="settings-note__title">Provider visibility</div>
                                Hide providers you do not want surfaced in this project.
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
                                <button className="btn" onClick={resetProjectDraft} disabled={!projectDirty || savingProject}>
                                    Reset
                                </button>
                                <button className="btn btn--primary" onClick={saveProjectSettings} disabled={!projectDirty || savingProject}>
                                    {savingProject ? 'Saving...' : projectMeta?.exists ? 'Update config' : 'Create config'}
                                </button>
                            </div>

                            {projectMessage && (
                                <div className="settings-note settings-note--success">{projectMessage}</div>
                            )}
                        </section>
                    </div>
                )
        }
    }

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h3><Settings size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Settings</h3>
                    <div className="settings-header-actions">
                        <button className="icon-btn" onClick={refreshSettings} aria-label="Refresh settings">
                            <RefreshCw size={14} />
                        </button>
                        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <div className="settings-body">
                    {/* Left sidebar */}
                    <div className="stg-sidebar">
                        <nav className="stg-sidebar__nav">
                            {SECTIONS.map((section) => (
                                <div key={section.label}>
                                    <div className="stg-sidebar__group-label">{section.label}</div>
                                    <div className="stg-sidebar__items">
                                        {section.items.map((item) => (
                                            <button
                                                key={item.key}
                                                className={`stg-sidebar__item ${activeTab === item.key ? 'active' : ''}`}
                                                onClick={() => setActiveTab(item.key)}
                                            >
                                                {item.icon}
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </nav>
                        <div className="stg-sidebar__footer">
                            DOT Studio<br />v0.1.0
                        </div>
                    </div>

                    {/* Right content */}
                    <div className="stg-content">
                        {error && (
                            <div className="stg-banner" style={{ color: '#f24822', background: 'rgba(242,72,34,0.1)', margin: '16px 24px 0' }}>
                                {error}
                            </div>
                        )}
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    )
}
