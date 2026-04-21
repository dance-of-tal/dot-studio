import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Settings, X, Sliders, Server, LayoutGrid, Wrench } from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import { queryKeys } from '../../hooks/queries'
import './SettingsModal.css'
import './SettingsControls.css'
import { useProviderAuth } from './useProviderAuth'
import type { ProviderCard } from './settings-utils'
import { buildProviderCards } from './settings-utils'

import SettingsGeneral from './SettingsGeneral'
import SettingsProviders from './SettingsProviders'
import SettingsModels from './SettingsModels'
import SettingsTools from './SettingsTools'

type SettingsTab = 'general' | 'providers' | 'models' | 'tools'

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
            { key: 'tools', label: 'Tools', icon: <Wrench size={14} /> },
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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [refreshToken, setRefreshToken] = useState(0)
    const providersRef = useRef<ProviderCard[]>([])
    const loadRequestIdRef = useRef(0)

    const selectedPerformer = useMemo(
        () => performers.find((p) => p.id === selectedPerformerId) || null,
        [performers, selectedPerformerId],
    )

    useEffect(() => {
        providersRef.current = providers
    }, [providers])

    const loadSettingsState = useCallback(async (showLoading = false) => {
        const requestId = ++loadRequestIdRef.current
        if (showLoading) {
            setLoading(true)
        }
        setError(null)

        try {
            const [providerRes, authMethodsRes] = await Promise.all([
                api.providers.list(),
                api.provider.authMethods().catch(() => ({})),
            ])

            const mergedProviders = buildProviderCards(
                providerRes,
                authMethodsRes || {},
            )
            if (requestId !== loadRequestIdRef.current) {
                return mergedProviders
            }

            setProviders(mergedProviders)

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
    }, [])

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
        setStatusMessage,
    })
    const syncFlowsWithProvidersRef = useRef(auth.syncFlowsWithProviders)

    useEffect(() => {
        syncFlowsWithProvidersRef.current = auth.syncFlowsWithProviders
    }, [auth.syncFlowsWithProviders])

    const refreshSettings = useCallback(async () => {
        setRefreshToken((value) => value + 1)
        try {
            const mergedProviders = await loadSettingsState(
                providersRef.current.length === 0,
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

    function renderContent() {
        if (loading && activeTab !== 'general') {
            return <div className="text-center p-4 text-muted">Loading…</div>
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
                        handleAuthMethod={auth.handleAuthMethod}
                        handleOauthPromptSubmit={auth.handleOauthPromptSubmit}
                        handleOauthCallback={auth.handleOauthCallback}
                        handleApiAuthSave={auth.handleApiAuthSave}
                        dismissOauthFlow={auth.dismissOauthFlow}
                        disconnectProvider={auth.disconnectProvider}
                        applyPickedModel={auth.applyPickedModel}
                        retryBrowserOauth={auth.retryBrowserOauth}
                        statusMessage={statusMessage}
                        awaitModelAssignmentOnConnect={!!selectedPerformer}
                    />
                )

            case 'models':
                return <SettingsModels key={`models-${refreshToken}`} />

            case 'tools':
                return <SettingsTools refreshToken={refreshToken} />
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
                            <div className="alert" style={{ color: '#f24822', background: 'rgba(242,72,34,0.1)', margin: '16px 24px 0' }}>
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
