import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Settings, X, Sliders, Server, Cpu, FolderCog, LayoutGrid } from 'lucide-react'
import { api } from '../../api'
import { queryKeys } from '../../hooks/queries'
import { useStudioStore } from '../../store'
import './SettingsModal.css'
import './SettingsControls.css'
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
import SettingsOpenCode from './SettingsOpenCode'
import SettingsProject from './SettingsProject'

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
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [projectDraft, setProjectDraft] = useState<ProjectSettingsDraft | null>(null)
    const [projectSnapshot, setProjectSnapshot] = useState<ProjectSettingsDraft | null>(null)
    const [projectMeta, setProjectMeta] = useState<ProjectConfigMeta | null>(null)
    const [savingProject, setSavingProject] = useState(false)
    const [projectMessage, setProjectMessage] = useState<string | null>(null)
    const projectDirtyRef = useRef(false)
    const projectDraftRef = useRef<ProjectSettingsDraft | null>(null)
    const projectSnapshotRef = useRef<ProjectSettingsDraft | null>(null)
    const providersRef = useRef<ProviderCard[]>([])
    const opencodeInfoRef = useRef<OpenCodeInfo | null>(null)
    const loadRequestIdRef = useRef(0)

    const selectedPerformer = useMemo(
        () => performers.find((p) => p.id === selectedPerformerId) || null,
        [performers, selectedPerformerId],
    )

    const projectDirty = useMemo(
        () => !isProjectDraftEqual(projectDraft, projectSnapshot),
        [projectDraft, projectSnapshot],
    )

    useEffect(() => {
        projectDirtyRef.current = projectDirty
    }, [projectDirty])

    useEffect(() => {
        projectDraftRef.current = projectDraft
    }, [projectDraft])

    useEffect(() => {
        projectSnapshotRef.current = projectSnapshot
    }, [projectSnapshot])

    useEffect(() => {
        providersRef.current = providers
    }, [providers])

    useEffect(() => {
        opencodeInfoRef.current = opencodeInfo
    }, [opencodeInfo])

    const loadSettingsState = useCallback(async (showLoading = false) => {
        const requestId = ++loadRequestIdRef.current
        if (showLoading) {
            setLoading(true)
        }
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

            const mergedProviders = mergeProviders(providerRes, authRes || {})
            if (requestId !== loadRequestIdRef.current) {
                return mergedProviders
            }

            setProviders(mergedProviders)
            setOpencodeInfo(healthRes)
            setProjectMeta({ exists: projectRes.exists, path: projectRes.path })

            if (
                !projectDirtyRef.current
                || !projectDraftRef.current
                || !projectSnapshotRef.current
            ) {
                const nextDraft = buildProjectDraft(mergedProviders, projectRes.config || {})
                setProjectDraft(nextDraft)
                setProjectSnapshot(nextDraft)
            }

            return mergedProviders
        } catch (err) {
            if (requestId === loadRequestIdRef.current) {
                setError(err instanceof Error ? err.message : String(err))
            }
            throw err
        } finally {
            if (requestId === loadRequestIdRef.current) {
                setLoading(false)
            }
        }
    }, [workingDir])

    async function refreshProviderState() {
        const mergedProviders = await loadSettingsState()
        await queryClient.invalidateQueries({ queryKey: queryKeys.models(workingDir), exact: true })
        await queryClient.refetchQueries({ queryKey: queryKeys.models(workingDir), exact: true, type: 'active' })
        return mergedProviders
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
    const syncFlowsWithProvidersRef = useRef(auth.syncFlowsWithProviders)

    useEffect(() => {
        syncFlowsWithProvidersRef.current = auth.syncFlowsWithProviders
    }, [auth.syncFlowsWithProviders])

    const refreshSettings = useCallback(async () => {
        try {
            const mergedProviders = await loadSettingsState(
                providersRef.current.length === 0 && !opencodeInfoRef.current,
            )
            syncFlowsWithProvidersRef.current(mergedProviders)
        } catch {
            // Error state is already surfaced in loadSettingsState.
        }
    }, [loadSettingsState])

    useEffect(() => {
        if (!open) return

        void refreshSettings()
    }, [open, refreshSettings, workingDir])

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
            await refreshProviderState()
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
                        applyPickedModel={auth.applyPickedModel}
                        retryBrowserOauth={auth.retryBrowserOauth}
                        projectMessage={projectMessage}
                    />
                )

            case 'models':
                return <SettingsModels />

            case 'opencode':
                return (
                    <SettingsOpenCode
                        opencodeInfo={opencodeInfo}
                        setError={setError}
                        onRestart={async () => {
                            await api.opencodeRestart()
                            await refreshSettings()
                        }}
                    />
                )

            case 'project':
                return (
                    <SettingsProject
                        projectMeta={projectMeta}
                        projectDraft={projectDraft}
                        providers={providers}
                        projectDirty={projectDirty}
                        savingProject={savingProject}
                        projectMessage={projectMessage}
                        toggleProviderVisibility={toggleProviderVisibility}
                        setProjectDraft={setProjectDraft}
                        resetProjectDraft={resetProjectDraft}
                        saveProjectSettings={saveProjectSettings}
                    />
                )
        }
    }

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h3><Settings size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Settings</h3>
                    <div className="settings-header-actions">
                        <button className="icon-btn" onClick={() => { void refreshSettings() }} aria-label="Refresh settings">
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
