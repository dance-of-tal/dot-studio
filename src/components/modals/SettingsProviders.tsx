/**
 * SettingsProviders — Provider management panel.
 * Uniform rows with a single Connect/Disconnect button per provider.
 * Connect opens ProviderConnectModal for configuration.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ProviderAuthMethod, ProviderCard, OauthFlow } from './settings-utils'
import type { ConnectedModel, ModelPickerState } from './settings-utils'
import {
    buildProviderAuthOptions,
    getAllProviderCards,
    getConnectedProviderCards,
    getPopularProviderCards,
    shouldAutoCloseProviderConnectModal,
    shouldShowProviderConnectModal,
} from './settings-utils'
import ProviderConnectModal from './ProviderConnectModal'

interface SettingsProvidersProps {
    providers: ProviderCard[]
    oauthFlows: Record<string, OauthFlow>
    setOauthFlows: React.Dispatch<React.SetStateAction<Record<string, OauthFlow>>>
    modelPicker: ModelPickerState | null
    setModelPicker: React.Dispatch<React.SetStateAction<ModelPickerState | null>>
    visibleModelPickerModels: ConnectedModel[]
    handleAuthMethod: (provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) => void
    handleOauthPromptSubmit: (providerId: string) => void
    handleOauthCallback: (providerId: string) => void
    handleApiAuthSave: (providerId: string) => void
    dismissOauthFlow: (providerId: string) => void
    disconnectProvider: (providerId: string, providerName: string) => void
    applyPickedModel: (model: ConnectedModel) => void
    retryBrowserOauth: (providerId: string) => void
    statusMessage: string | null
    awaitModelAssignmentOnConnect: boolean
}

export default function SettingsProviders(props: SettingsProvidersProps) {
    const {
        providers, oauthFlows, setOauthFlows, modelPicker, setModelPicker,
        visibleModelPickerModels, handleAuthMethod, handleOauthPromptSubmit,
        handleOauthCallback, handleApiAuthSave, dismissOauthFlow,
        disconnectProvider, applyPickedModel,
        retryBrowserOauth, statusMessage, awaitModelAssignmentOnConnect,
    } = props

    const [connectTargetId, setConnectTargetId] = useState<string | null>(null)

    const connected = useMemo(() => getConnectedProviderCards(providers), [providers])
    const popular = useMemo(() => getPopularProviderCards(providers), [providers])
    const allProviders = useMemo(() => getAllProviderCards(providers), [providers])

    const connectTarget = useMemo(
        () => connectTargetId ? providers.find((provider) => provider.id === connectTargetId) || null : null,
        [connectTargetId, providers],
    )
    const connectFlow = connectTargetId ? oauthFlows[connectTargetId] : undefined
    const connectModelPicker = modelPicker?.providerId === connectTargetId ? modelPicker : null
    const shouldShowConnectModal = shouldShowProviderConnectModal(
        connectTarget,
        connectFlow,
        connectModelPicker,
    )

    useEffect(() => {
        if (!connectTargetId) {
            return
        }

        if (shouldAutoCloseProviderConnectModal(
            connectTarget,
            connectFlow,
            connectModelPicker,
            awaitModelAssignmentOnConnect,
        )) {
            queueMicrotask(() => {
                setConnectTargetId((current) => (current === connectTargetId ? null : current))
            })
        }
    }, [
        awaitModelAssignmentOnConnect,
        connectFlow,
        connectModelPicker,
        connectTarget,
        connectTargetId,
    ])

    function renderProviderRow(provider: ProviderCard) {
        const isConnected = provider.connected && (provider.id !== 'opencode' || provider.hasPaidModels)
        const canConnect = buildProviderAuthOptions(provider).length > 0

        return (
            <div key={provider.id} className="stg-provider-row">
                <div className="stg-provider-row__info">
                    <span className="stg-provider-row__name">{provider.name}</span>
                    {isConnected ? (
                        <span className="badge">Connected</span>
                    ) : (
                        <span className="stg-provider-row__meta">{provider.modelCount} models</span>
                    )}
                    {provider.env.length > 0 && (
                        <span className="badge badge--subtle">{provider.env[0]}</span>
                    )}
                </div>
                <div className="stg-provider-row__actions">
                    {isConnected
                        ? (
                            provider.source === 'env'
                                ? <span className="badge badge--subtle">Set via environment</span>
                                : (
                                    <button className="btn" onClick={() => disconnectProvider(provider.id, provider.name)}>
                                        Disconnect
                                    </button>
                                )
                        )
                        : canConnect ? (
                            <button className="btn btn--primary" onClick={() => setConnectTargetId(provider.id)}>
                                Connect
                            </button>
                        ) : (
                            <span className="badge badge--subtle">Config only</span>
                        )}
                </div>
            </div>
        )
    }

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">Providers</h2>
            </div>

            {statusMessage && <div className="alert alert--success">{statusMessage}</div>}

            {/* Connected providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Connected</h3>
                <div className="stg-group">
                    {connected.length === 0 ? (
                        <div className="empty-state">No providers connected yet.</div>
                    ) : (
                        connected.map((provider) => renderProviderRow(provider))
                    )}
                </div>
            </div>

            {/* Popular providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Popular</h3>
                <div className="stg-group">
                    {popular.length === 0 ? (
                        <div className="empty-state">No popular providers available.</div>
                    ) : (
                        popular.map((provider) => renderProviderRow(provider))
                    )}
                </div>
            </div>

            {/* All providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">All providers</h3>
                <div className="stg-group">
                    {allProviders.length === 0 ? (
                        <div className="empty-state">All available providers are already surfaced above.</div>
                    ) : (
                        allProviders.map((provider) => renderProviderRow(provider))
                    )}
                </div>
            </div>

            {/* Connect modal overlay */}
            {connectTarget && shouldShowConnectModal && (
                <ProviderConnectModal
                    provider={connectTarget}
                    flow={connectFlow}
                    modelPicker={connectModelPicker}
                    visibleModelPickerModels={visibleModelPickerModels}
                    onClose={() => setConnectTargetId(null)}
                    handleAuthMethod={handleAuthMethod}
                    handleOauthPromptSubmit={handleOauthPromptSubmit}
                    handleOauthCallback={handleOauthCallback}
                    handleApiAuthSave={handleApiAuthSave}
                    dismissOauthFlow={dismissOauthFlow}
                    retryBrowserOauth={retryBrowserOauth}
                    setOauthFlows={setOauthFlows}
                    applyPickedModel={applyPickedModel}
                    setModelPicker={setModelPicker}
                />
            )}
        </div>
    )
}
