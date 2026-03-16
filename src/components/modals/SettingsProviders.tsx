/**
 * SettingsProviders — Provider management panel.
 * Mirrors OpenCode's settings-providers.tsx with connected/popular sections.
 */

import { useMemo } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { ProviderCard, OauthFlow } from './settings-utils'
import { isPopularProvider, providerSupportsApiKey, labelForAuthMethod } from './settings-utils'
import type { ConnectedModel, ModelPickerState } from './settings-utils'

interface SettingsProvidersProps {
    providers: ProviderCard[]
    oauthFlows: Record<string, OauthFlow>
    setOauthFlows: React.Dispatch<React.SetStateAction<Record<string, OauthFlow>>>
    modelPicker: ModelPickerState | null
    setModelPicker: React.Dispatch<React.SetStateAction<ModelPickerState | null>>
    visibleModelPickerModels: ConnectedModel[]
    openApiKeyFlow: (provider: ProviderCard) => void
    handleAuthMethod: (provider: ProviderCard, methodIndex: number, method: any) => void
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

function ProviderFlowPanel({
    provider,
    flow,
    setOauthFlows,
    handleApiAuthSave,
    handleOauthCallback,
    dismissOauthFlow,
    retryBrowserOauth,
}: {
    provider: ProviderCard
    flow: OauthFlow
    setOauthFlows: React.Dispatch<React.SetStateAction<Record<string, OauthFlow>>>
    handleApiAuthSave: (id: string) => void
    handleOauthCallback: (id: string) => void
    dismissOauthFlow: (id: string) => void
    retryBrowserOauth: (id: string) => void
}) {
    return (
        <div className="stg-flow">
            <div className="stg-flow__header">
                <span className="stg-flow__label">{flow.label}</span>
                <button className="icon-btn" onClick={() => dismissOauthFlow(provider.id)}>
                    <X size={12} />
                </button>
            </div>
            <div className="stg-note">{flow.instructions || 'Complete authorization in the opened browser window.'}</div>

            {flow.mode === 'code' || flow.mode === 'api' ? (
                <div className="stg-flow__input-row">
                    <input
                        className="input"
                        value={flow.code}
                        onChange={(e) => {
                            const code = e.target.value
                            setOauthFlows((cur) => ({
                                ...cur,
                                [provider.id]: { ...flow, code, error: undefined },
                            }))
                        }}
                        placeholder={flow.mode === 'api' ? 'Paste credential' : 'Paste authorization code'}
                        type={flow.mode === 'api' ? 'password' : 'text'}
                    />
                    <button
                        className="btn btn--primary"
                        onClick={() => flow.mode === 'api' ? handleApiAuthSave(provider.id) : handleOauthCallback(provider.id)}
                        disabled={flow.submitting || !flow.code.trim()}
                    >
                        {flow.submitting ? 'Submitting...' : flow.mode === 'api' ? 'Save' : 'Submit'}
                    </button>
                </div>
            ) : (
                <>
                    <div className="stg-note stg-note--muted">
                        {flow.submitting
                            ? 'Waiting for OpenCode to receive the callback…'
                            : 'Browser auth is paused. Retry or reopen the auth window.'}
                    </div>
                    <div className="stg-actions">
                        {flow.url && (
                            <button className="btn" onClick={() => window.open(flow.url, '_blank', 'noopener,noreferrer')}>
                                <ExternalLink size={12} /> Reopen
                            </button>
                        )}
                        <button className="btn btn--primary" onClick={() => retryBrowserOauth(provider.id)} disabled={flow.submitting}>
                            {flow.submitting ? 'Waiting…' : 'Retry'}
                        </button>
                    </div>
                </>
            )}
            {flow.error && <div className="stg-note stg-note--error">{flow.error}</div>}
        </div>
    )
}

export default function SettingsProviders(props: SettingsProvidersProps) {
    const {
        providers, oauthFlows, setOauthFlows, modelPicker, setModelPicker,
        visibleModelPickerModels, openApiKeyFlow, handleAuthMethod,
        handleOauthCallback, handleApiAuthSave, dismissOauthFlow,
        disconnectProvider, openModelPicker, applyPickedModel,
        retryBrowserOauth, selectedPerformer, projectMessage,
    } = props

    const connected = useMemo(
        () => providers.filter((p) => p.connected),
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

            {/* Model picker banner */}
            {modelPicker && (
                <div className="stg-banner stg-banner--success">
                    <div className="stg-banner__text">
                        {modelPicker.performerId
                            ? `${modelPicker.providerName} connected. Pick a model for ${modelPicker.performerName || 'the selected performer'}.`
                            : `${modelPicker.providerName} connected. Select a performer to assign a model.`}
                    </div>
                    {modelPicker.performerId && (
                        <div className="stg-model-picker">
                            <input
                                className="input"
                                value={modelPicker.query}
                                onChange={(e) => setModelPicker((cur) => cur ? { ...cur, query: e.target.value } : cur)}
                                placeholder={`Search ${modelPicker.providerName} models`}
                            />
                            <div className="stg-model-picker__list">
                                {visibleModelPickerModels.slice(0, 12).map((model) => (
                                    <button key={`${model.provider}:${model.id}`} className="stg-model-opt" onClick={() => applyPickedModel(model)}>
                                        <span className="stg-model-opt__name">{model.name || model.id}</span>
                                        <span className="stg-model-opt__meta">
                                            {model.id}
                                            {model.toolCall ? ' · tools' : ''}{model.reasoning ? ' · reasoning' : ''}
                                        </span>
                                    </button>
                                ))}
                                {visibleModelPickerModels.length === 0 && (
                                    <div className="stg-note stg-note--muted">No models matched.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {projectMessage && <div className="stg-banner stg-banner--success">{projectMessage}</div>}

            {/* Connected providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Connected</h3>
                <div className="stg-group">
                    {connected.length === 0 ? (
                        <div className="stg-empty">No providers connected yet.</div>
                    ) : (
                        connected.map((provider) => {
                            const flow = oauthFlows[provider.id]
                            return (
                                <div key={provider.id} className="stg-provider-row">
                                    <div className="stg-provider-row__info">
                                        <span className="stg-provider-row__name">{provider.name}</span>
                                        <span className="stg-tag">Connected</span>
                                        {provider.env.length > 0 && (
                                            <span className="stg-tag stg-tag--subtle">{provider.env[0]}</span>
                                        )}
                                    </div>
                                    <div className="stg-provider-row__actions">
                                        {selectedPerformer && (
                                            <button className="btn" onClick={() => openModelPicker(provider.id, provider.name)}>
                                                Choose Model
                                            </button>
                                        )}
                                        <button className="btn" onClick={() => disconnectProvider(provider.id, provider.name)}>
                                            Disconnect
                                        </button>
                                    </div>
                                    {flow && (
                                        <ProviderFlowPanel
                                            provider={provider}
                                            flow={flow}
                                            setOauthFlows={setOauthFlows}
                                            handleApiAuthSave={handleApiAuthSave}
                                            handleOauthCallback={handleOauthCallback}
                                            dismissOauthFlow={dismissOauthFlow}
                                            retryBrowserOauth={retryBrowserOauth}
                                        />
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Popular providers */}
            <div className="stg-section">
                <h3 className="stg-section__title">Popular</h3>
                <div className="stg-group">
                    {popular.map((provider) => {
                        const flow = oauthFlows[provider.id]
                        const supportsApi = providerSupportsApiKey(provider)
                        const oauthMethods = provider.authMethods
                            .map((method, methodIndex) => ({ method, methodIndex }))
                            .filter(({ method }) => method.type === 'oauth')

                        return (
                            <div key={provider.id} className="stg-provider-row">
                                <div className="stg-provider-row__info">
                                    <span className="stg-provider-row__name">{provider.name}</span>
                                    <span className="stg-provider-row__meta">{provider.modelCount} models</span>
                                </div>
                                <div className="stg-provider-row__actions">
                                    {supportsApi && (
                                        <button className="btn btn--primary" onClick={() => openApiKeyFlow(provider)}>
                                            Connect
                                        </button>
                                    )}
                                    {oauthMethods.map(({ method, methodIndex }) => (
                                        <button
                                            key={`${provider.id}-${methodIndex}`}
                                            className="btn"
                                            onClick={() => handleAuthMethod(provider, methodIndex, method)}
                                        >
                                            <ExternalLink size={12} />
                                            {labelForAuthMethod(method)}
                                        </button>
                                    ))}
                                </div>
                                {flow && (
                                    <ProviderFlowPanel
                                        provider={provider}
                                        flow={flow}
                                        setOauthFlows={setOauthFlows}
                                        handleApiAuthSave={handleApiAuthSave}
                                        handleOauthCallback={handleOauthCallback}
                                        dismissOauthFlow={dismissOauthFlow}
                                        retryBrowserOauth={retryBrowserOauth}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
