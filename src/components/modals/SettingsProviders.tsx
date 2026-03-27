/**
 * SettingsProviders — Provider management panel.
 * Uniform rows with a single Connect/Disconnect button per provider.
 * Connect opens ProviderConnectModal for configuration.
 */

import { useMemo, useState } from 'react'
import type { ProviderAuthMethod, ProviderCard, OauthFlow } from './settings-utils'
import type { ConnectedModel, ModelPickerState } from './settings-utils'
import { isPopularProvider } from './settings-utils'
import ProviderConnectModal from './ProviderConnectModal'

interface SettingsProvidersProps {
    providers: ProviderCard[]
    oauthFlows: Record<string, OauthFlow>
    setOauthFlows: React.Dispatch<React.SetStateAction<Record<string, OauthFlow>>>
    modelPicker: ModelPickerState | null
    setModelPicker: React.Dispatch<React.SetStateAction<ModelPickerState | null>>
    visibleModelPickerModels: ConnectedModel[]
    openApiKeyFlow: (provider: ProviderCard) => void
    handleAuthMethod: (provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) => void
    handleOauthCallback: (providerId: string) => void
    handleApiAuthSave: (providerId: string) => void
    dismissOauthFlow: (providerId: string) => void
    disconnectProvider: (providerId: string, providerName: string) => void
    openModelPicker: (providerId: string, providerName: string) => void
    applyPickedModel: (model: ConnectedModel) => void
    retryBrowserOauth: (providerId: string) => void
    selectedPerformer: { id: string; name: string } | null
    projectMessage: string | null
}

const POPULAR_ORDER = [
    'opencode', 'anthropic', 'openai', 'google',
    'github-copilot', 'openrouter', 'amazon-bedrock', 'azure',
]

export default function SettingsProviders(props: SettingsProvidersProps) {
    const {
        providers, oauthFlows, setOauthFlows, modelPicker, setModelPicker,
        visibleModelPickerModels, openApiKeyFlow, handleAuthMethod,
        handleOauthCallback, handleApiAuthSave, dismissOauthFlow,
        disconnectProvider, applyPickedModel,
        retryBrowserOauth, projectMessage,
    } = props

    const [connectTarget, setConnectTarget] = useState<ProviderCard | null>(null)

    const connected = useMemo(
        () => providers.filter((p) => p.connected && p.id !== 'opencode'),
        [providers],
    )

    const popular = useMemo(() => {
        const connectedIds = new Set(connected.map((p) => p.id))
        return providers
            .filter((p) => !connectedIds.has(p.id) && isPopularProvider(p.id))
            .sort((a, b) => {
                const ai = POPULAR_ORDER.indexOf(a.id)
                const bi = POPULAR_ORDER.indexOf(b.id)
                return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
            })
    }, [providers, connected])

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">Providers</h2>
            </div>

            {projectMessage && <div className="stg-banner stg-banner--success">{projectMessage}</div>}

            {/* Connected providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Connected</h3>
                <div className="stg-group">
                    {connected.length === 0 ? (
                        <div className="stg-empty">No providers connected yet.</div>
                    ) : (
                        connected.map((provider) => (
                            <div key={provider.id} className="stg-provider-row">
                                <div className="stg-provider-row__info">
                                    <span className="stg-provider-row__name">{provider.name}</span>
                                    <span className="stg-tag">Connected</span>
                                    {provider.env.length > 0 && (
                                        <span className="stg-tag stg-tag--subtle">{provider.env[0]}</span>
                                    )}
                                </div>
                                <div className="stg-provider-row__actions">
                                    {provider.source === 'env'
                                        ? <span className="stg-tag stg-tag--subtle">Set via environment</span>
                                        : (
                                            <button className="btn" onClick={() => disconnectProvider(provider.id, provider.name)}>
                                                Disconnect
                                            </button>
                                        )
                                    }
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Popular providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Popular</h3>
                <div className="stg-group">
                    {popular.map((provider) => (
                        <div key={provider.id} className="stg-provider-row">
                            <div className="stg-provider-row__info">
                                <span className="stg-provider-row__name">{provider.name}</span>
                                <span className="stg-provider-row__meta">{provider.modelCount} models</span>
                            </div>
                            <div className="stg-provider-row__actions">
                                <button className="btn btn--primary" onClick={() => setConnectTarget(provider)}>
                                    Connect
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Connect modal overlay */}
            {connectTarget && (
                <ProviderConnectModal
                    provider={connectTarget}
                    flow={oauthFlows[connectTarget.id]}
                    modelPicker={modelPicker}
                    visibleModelPickerModels={visibleModelPickerModels}
                    onClose={() => setConnectTarget(null)}
                    openApiKeyFlow={openApiKeyFlow}
                    handleAuthMethod={handleAuthMethod}
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
