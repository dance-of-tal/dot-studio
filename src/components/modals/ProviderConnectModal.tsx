/**
 * ProviderConnectModal — Dedicated modal for provider connection.
 *
 * Opens inside the settings overlay when a user clicks "Connect" on a provider.
 * Shows auth method options, handles API key input and OAuth flows,
 * then optionally transitions to model picker on success.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Key, ExternalLink } from 'lucide-react'
import type { ProviderCard, ProviderAuthMethod, OauthFlow, ConnectedModel, ModelPickerState } from './settings-utils'
import {
    areVisibleProviderPromptsComplete,
    buildProviderAuthOptions,
    getVisibleProviderAuthPrompts,
    labelForAuthMethod,
} from './settings-utils'
import './ProviderConnectModal.css'

type Step = 'choose' | 'api' | 'oauth' | 'pick-model'

interface ProviderConnectModalProps {
    provider: ProviderCard
    flow: OauthFlow | undefined
    modelPicker: ModelPickerState | null
    visibleModelPickerModels: ConnectedModel[]
    onClose: () => void
    handleAuthMethod: (provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) => void
    handleOauthPromptSubmit: (providerId: string) => void
    handleOauthCallback: (providerId: string) => void
    handleApiAuthSave: (providerId: string) => void
    dismissOauthFlow: (providerId: string) => void
    retryBrowserOauth: (providerId: string) => void
    setOauthFlows: React.Dispatch<React.SetStateAction<Record<string, OauthFlow>>>
    applyPickedModel: (model: ConnectedModel) => void
    setModelPicker: React.Dispatch<React.SetStateAction<ModelPickerState | null>>
}

export default function ProviderConnectModal({
    provider,
    flow,
    modelPicker,
    visibleModelPickerModels,
    onClose,
    handleAuthMethod,
    handleOauthPromptSubmit,
    handleOauthCallback,
    handleApiAuthSave,
    dismissOauthFlow,
    retryBrowserOauth,
    setOauthFlows,
    applyPickedModel,
    setModelPicker,
}: ProviderConnectModalProps) {
    const availableMethods = buildProviderAuthOptions(provider)
    const defaultMethod = availableMethods.length === 1 ? availableMethods[0] : null

    // Determine current step
    const [selectedStep, setSelectedStep] = useState<Step | null>(null)
    const baseStep = useMemo<Step>(() => {
        if (defaultMethod) {
            return defaultMethod.method.type === 'api' ? 'api' : 'oauth'
        }
        return 'choose'
    }, [defaultMethod])

    const step: Step = useMemo(() => {
        if (modelPicker) return 'pick-model'
        if (flow?.authType === 'api') return 'api'
        if (flow?.authType === 'oauth') return 'oauth'
        return selectedStep ?? baseStep
    }, [baseStep, flow?.authType, modelPicker, selectedStep])

    useEffect(() => {
        if (!defaultMethod || flow || modelPicker || selectedStep !== null) {
            return
        }
        setSelectedStep(defaultMethod.method.type === 'api' ? 'api' : 'oauth')
        void handleAuthMethod(provider, defaultMethod.methodIndex, defaultMethod.method)
    }, [defaultMethod, flow, handleAuthMethod, modelPicker, provider, selectedStep])

    function handleClose() {
        if (flow) dismissOauthFlow(provider.id)
        if (modelPicker) setModelPicker(null)
        onClose()
    }

    function handleMethodClick(methodIndex: number, method: ProviderAuthMethod) {
        setSelectedStep(method.type === 'api' ? 'api' : 'oauth')
        void handleAuthMethod(provider, methodIndex, method)
    }

    const visiblePrompts = useMemo(
        () => flow ? getVisibleProviderAuthPrompts(flow.prompts, flow.promptValues) : [],
        [flow],
    )

    const promptsComplete = flow
        ? areVisibleProviderPromptsComplete(flow.prompts, flow.promptValues)
        : false

    function updatePromptValue(key: string, value: string) {
        if (!flow) {
            return
        }
        setOauthFlows((current) => ({
            ...current,
            [provider.id]: {
                ...flow,
                promptValues: {
                    ...flow.promptValues,
                    [key]: value,
                },
                error: undefined,
            },
        }))
    }

    function renderPromptInputs() {
        if (!flow || visiblePrompts.length === 0) {
            return null
        }

        return (
            <div className="provider-connect-modal__prompt-list">
                {visiblePrompts.map((prompt) => (
                    <label key={prompt.key} className="provider-connect-modal__prompt-field">
                        <span className="provider-connect-modal__prompt-label">{prompt.message}</span>
                        {prompt.type === 'select' ? (
                            <select
                                className="select"
                                value={flow.promptValues[prompt.key] || ''}
                                onChange={(event) => updatePromptValue(prompt.key, event.target.value)}
                            >
                                {prompt.options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.hint ? `${option.label} - ${option.hint}` : option.label}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                className="input"
                                value={flow.promptValues[prompt.key] || ''}
                                onChange={(event) => updatePromptValue(prompt.key, event.target.value)}
                                placeholder={prompt.placeholder}
                                type="text"
                            />
                        )}
                    </label>
                ))}
            </div>
        )
    }

    return (
        <div className="provider-connect-overlay" onClick={handleClose}>
            <div className="provider-connect-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="provider-connect-modal__header">
                    <span className="provider-connect-modal__title">
                        {step === 'pick-model' ? 'Choose Model' : `Connect ${provider.name}`}
                    </span>
                    <button className="icon-btn" onClick={handleClose}>
                        <X size={14} />
                    </button>
                </div>

                {/* Body */}
                <div className="provider-connect-modal__body">
                    {/* Step: Choose auth method */}
                    {step === 'choose' && (
                        <div className="provider-connect-modal__methods">
                            {availableMethods.map(({ method, methodIndex }) => (
                                <button
                                    key={`${provider.id}-${methodIndex}-${method.label}`}
                                    className="provider-connect-modal__method-btn"
                                    onClick={() => handleMethodClick(methodIndex, method)}
                                >
                                    {method.type === 'api'
                                        ? <Key size={14} className="provider-connect-modal__method-icon" />
                                        : <ExternalLink size={14} className="provider-connect-modal__method-icon" />}
                                    <span className="provider-connect-modal__method-label">{labelForAuthMethod(method)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Step: API key input */}
                    {step === 'api' && flow && (
                        <div className="provider-connect-modal__api-section">
                            <div className="stg-note">{flow.instructions || `Paste the API key for ${provider.name}.`}</div>
                            {renderPromptInputs()}
                            <div className="provider-connect-modal__api-row">
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
                                    placeholder="Paste credential"
                                    type="password"
                                    autoFocus
                                />
                                <button
                                    className="btn btn--primary"
                                    onClick={() => handleApiAuthSave(provider.id)}
                                    disabled={flow.submitting || !flow.code.trim() || !promptsComplete}
                                >
                                    {flow.submitting ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                            {flow.error && <div className="stg-note stg-note--error">{flow.error}</div>}
                        </div>
                    )}

                    {/* Step: OAuth flow */}
                    {step === 'oauth' && flow && (
                        <div className="provider-connect-modal__oauth-section">
                            {flow.mode === 'prompt' ? (
                                <>
                                    <div className="stg-note">{flow.instructions || 'Provide the required details to continue authorization.'}</div>
                                    {renderPromptInputs()}
                                    <div className="stg-actions">
                                        <button
                                            className="btn btn--primary"
                                            onClick={() => handleOauthPromptSubmit(provider.id)}
                                            disabled={flow.submitting || !promptsComplete}
                                        >
                                            {flow.submitting ? 'Starting…' : 'Continue'}
                                        </button>
                                    </div>
                                </>
                            ) : flow.mode === 'code' ? (
                                <>
                                    <div className="stg-note">{flow.instructions || 'Complete authorization in the opened browser window.'}</div>
                                    <div className="provider-connect-modal__api-row">
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
                                            placeholder="Paste authorization code"
                                            type="text"
                                            autoFocus
                                        />
                                        <button
                                            className="btn btn--primary"
                                            onClick={() => handleOauthCallback(provider.id)}
                                            disabled={flow.submitting || !flow.code.trim()}
                                        >
                                            {flow.submitting ? 'Submitting…' : 'Submit'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="stg-note stg-note--muted">
                                        {flow.submitting
                                            ? 'Waiting for authorization callback…'
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
                    )}

                    {/* Step: Model picker */}
                    {step === 'pick-model' && modelPicker && (
                        <div className="stg-model-picker">
                            <div className="stg-note stg-note--success">
                                {provider.name} connected! Pick a model to assign.
                            </div>
                            <input
                                className="input"
                                value={modelPicker.query}
                                onChange={(e) => setModelPicker((cur) => cur ? { ...cur, query: e.target.value } : cur)}
                                placeholder={`Search ${modelPicker.providerName} models`}
                                autoFocus
                            />
                            <div className="stg-model-picker__list">
                                {visibleModelPickerModels.slice(0, 12).map((model) => (
                                    <button
                                        key={`${model.provider}:${model.id}`}
                                        className="stg-model-opt"
                                        onClick={() => { applyPickedModel(model); handleClose() }}
                                    >
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
            </div>
        </div>
    )
}
