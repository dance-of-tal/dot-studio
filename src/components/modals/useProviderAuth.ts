/**
 * useProviderAuth – Provider OAuth / API-key authentication logic
 * extracted from SettingsModal.
 *
 * Manages: OAuth flow state, browser-auth wait, provider-defined auth prompts,
 * API key save, model picker, provider disconnect.
 */

import { useMemo, useState } from 'react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import type {
    ProviderCard,
    ProviderAuthMethod,
    OauthFlow,
    ConnectedModel,
    ModelPickerState,
} from './settings-utils'
import {
    areVisibleProviderPromptsComplete,
    buildApiKeyProviderAuth,
    buildVisibleProviderPromptInputs,
    createPromptValueDraft,
    getProviderAuthSuccessAction,
} from './settings-utils'

type ProjectConfigResponseLike = {
    config: {
        disabled_providers?: string[]
        provider?: Record<string, {
            npm?: string
            models?: Record<string, unknown>
        }>
    }
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

function buildApiInstructions(provider: ProviderCard, method?: ProviderAuthMethod) {
    const hasPrompts = (method?.prompts || []).length > 0
    if (!hasPrompts && provider.env.length > 0) {
        return `Paste the credential for ${provider.name}. OpenCode will store it in its auth store for ${provider.env.join(', ')}.`
    }
    if (!hasPrompts) {
        return `Paste the credential for ${provider.name}. OpenCode will store it in its auth store.`
    }
    return `Provide the required details for ${provider.name}. OpenCode will store the credential and provider metadata in its auth store.`
}

function findProviderMethod(
    providers: ProviderCard[],
    providerId: string,
    methodIndex: number,
) {
    if (methodIndex < 0) {
        return null
    }

    const provider = providers.find((entry) => entry.id === providerId)
    if (!provider) {
        return null
    }

    return provider.authMethods[methodIndex] || null
}

interface UseProviderAuthOptions {
    providers: ProviderCard[]
    selectedPerformer: { id: string; name: string } | null
    setPerformerModel: (id: string, model: { provider: string; modelId: string }) => void
    refreshProviderState: () => Promise<ProviderCard[]>
    setError: (msg: string | null) => void
    setStatusMessage: (msg: string | null) => void
}

export function useProviderAuth(options: UseProviderAuthOptions) {
    const {
        providers,
        selectedPerformer,
        setPerformerModel,
        refreshProviderState,
        setError,
        setStatusMessage,
    } = options

    const [oauthFlows, setOauthFlows] = useState<Record<string, OauthFlow>>({})
    const [modelPicker, setModelPicker] = useState<ModelPickerState | null>(null)

    const visibleModelPickerModels = useMemo(
        () => modelPicker ? filterModelPickerModels(modelPicker) : [],
        [modelPicker],
    )

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
        const refreshedProviders = await refreshProviderState()
        const refreshedProvider = refreshedProviders.find((provider) => provider.id === providerId)
        const nextProviderName = refreshedProvider?.name || providerName

        if (getProviderAuthSuccessAction(selectedPerformer) === 'pick-model') {
            await openModelPicker(providerId, nextProviderName)
            clearProviderFlow(providerId)
            return
        }

        clearProviderFlow(providerId)
        setModelPicker((current) => current?.providerId === providerId ? null : current)
        setStatusMessage(`${nextProviderName} connected.`)
    }

    async function waitForBrowserOauth(providerId: string, methodIndex: number) {
        try {
            await api.provider.oauthCallback(providerId, methodIndex)
            useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
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

    function openApiKeyFlow(provider: ProviderCard, methodIndex = -1, method?: ProviderAuthMethod) {
        setModelPicker(null)
        setOauthFlows((current) => ({
            ...current,
            [provider.id]: {
                authType: 'api',
                methodIndex,
                label: method?.label || 'API Key',
                mode: 'api',
                instructions: buildApiInstructions(provider, method),
                code: '',
                submitting: false,
                error: undefined,
                prompts: method?.prompts || [],
                promptValues: createPromptValueDraft(method?.prompts),
            },
        }))
    }

    function openOauthPromptFlow(provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) {
        setModelPicker(null)
        setOauthFlows((current) => ({
            ...current,
            [provider.id]: {
                authType: 'oauth',
                methodIndex,
                label: method.label,
                mode: 'prompt',
                instructions: `Provide the required details for ${provider.name} to continue authorization.`,
                code: '',
                submitting: false,
                error: undefined,
                prompts: method.prompts || [],
                promptValues: createPromptValueDraft(method.prompts),
            },
        }))
    }

    async function startOauthAuthorization(
        provider: ProviderCard,
        methodIndex: number,
        method: ProviderAuthMethod,
        promptValues: Record<string, string>,
    ) {
        const nextPromptValues = createPromptValueDraft(method.prompts, promptValues)

        setOauthFlows((current) => ({
            ...current,
            [provider.id]: {
                authType: 'oauth',
                methodIndex,
                label: method.label,
                mode: 'prompt',
                instructions: `Starting authorization for ${provider.name}…`,
                code: '',
                submitting: true,
                error: undefined,
                prompts: method.prompts || [],
                promptValues: nextPromptValues,
            },
        }))

        try {
            const promptFlow: OauthFlow = {
                authType: 'oauth',
                methodIndex,
                label: method.label,
                mode: 'prompt',
                instructions: '',
                code: '',
                submitting: false,
                prompts: method.prompts || [],
                promptValues: nextPromptValues,
            }
            const authorization = await api.provider.oauthAuthorize(
                provider.id,
                methodIndex,
                buildVisibleProviderPromptInputs(promptFlow.prompts, promptFlow.promptValues),
            )

            if (authorization.url) {
                window.open(authorization.url, '_blank', 'noopener,noreferrer')
            }

            setOauthFlows((current) => ({
                ...current,
                [provider.id]: {
                    authType: 'oauth',
                    methodIndex,
                    label: method.label,
                    mode: authorization.method,
                    url: authorization.url,
                    instructions: authorization.instructions || '',
                    code: '',
                    submitting: authorization.method === 'auto',
                    error: undefined,
                    prompts: method.prompts || [],
                    promptValues: nextPromptValues,
                },
            }))

            if (authorization.method === 'auto') {
                void waitForBrowserOauth(provider.id, methodIndex)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            setOauthFlows((current) => ({
                ...current,
                [provider.id]: {
                    authType: 'oauth',
                    methodIndex,
                    label: method.label,
                    mode: 'prompt',
                    instructions: `Provide the required details for ${provider.name} to continue authorization.`,
                    code: '',
                    submitting: false,
                    error: message,
                    prompts: method.prompts || [],
                    promptValues: nextPromptValues,
                },
            }))
        }
    }

    async function handleAuthMethod(provider: ProviderCard, methodIndex: number, method: ProviderAuthMethod) {
        setError(null)
        setStatusMessage(null)

        if (method.type === 'api') {
            openApiKeyFlow(provider, methodIndex, method)
            return
        }

        if ((method.prompts || []).length > 0) {
            openOauthPromptFlow(provider, methodIndex, method)
            return
        }

        await startOauthAuthorization(provider, methodIndex, method, {})
    }

    async function handleOauthPromptSubmit(providerId: string) {
        const flow = oauthFlows[providerId]
        if (!flow || flow.authType !== 'oauth' || flow.mode !== 'prompt') {
            return
        }

        const provider = providers.find((entry) => entry.id === providerId)
        const method = findProviderMethod(providers, providerId, flow.methodIndex)
        if (!provider || !method || method.type !== 'oauth') {
            return
        }

        setError(null)
        setStatusMessage(null)
        await startOauthAuthorization(provider, flow.methodIndex, method, flow.promptValues)
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
            useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
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
        if (
            !flow
            || flow.authType !== 'api'
            || flow.mode !== 'api'
            || !areVisibleProviderPromptsComplete(flow.prompts, flow.promptValues)
        ) {
            return
        }

        const payload = buildApiKeyProviderAuth(flow.code, flow.prompts, flow.promptValues)
        if (!payload) {
            return
        }

        updateProviderFlow(providerId, (currentFlow) => ({
            ...currentFlow,
            submitting: true,
            error: undefined,
        }))

        try {
            await api.provider.setAuth(providerId, payload)
            useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
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
        setStatusMessage(null)
        try {
            const projectRes = await api.config.getProject().catch(
                (): ProjectConfigResponseLike => ({ config: {} }),
            ) as ProjectConfigResponseLike
            const projectProvider = projectRes.config?.provider?.[providerId]
            const isConfigCustom = Boolean(
                projectProvider
                && projectProvider.npm === '@ai-sdk/openai-compatible'
                && projectProvider.models
                && Object.keys(projectProvider.models).length > 0,
            )

            await api.provider.clearAuth(providerId)
            useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
            if (isConfigCustom) {
                const current = Array.isArray(projectRes.config?.disabled_providers)
                    ? projectRes.config.disabled_providers
                    : []
                if (!current.includes(providerId)) {
                    await api.config.updateProject({
                        disabled_providers: [...current, providerId],
                    }).catch(() => {})
                    useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
                }
            }
            clearProviderFlow(providerId)
            setModelPicker((current) => current?.providerId === providerId ? null : current)
            await refreshProviderState()
            setStatusMessage(`${providerName} credentials cleared from OpenCode auth store.`)
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
        setStatusMessage(`${model.name || model.id} applied to ${modelPicker.performerName || 'the selected performer'}.`)
        setModelPicker(null)
    }

    async function retryBrowserOauth(providerId: string) {
        const flow = oauthFlows[providerId]
        if (!flow || flow.authType !== 'oauth' || flow.mode !== 'auto') {
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

    function syncFlowsWithProviders(mergedProviders: ProviderCard[]) {
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
    }

    return {
        oauthFlows,
        setOauthFlows,
        modelPicker,
        setModelPicker,
        visibleModelPickerModels,
        handleAuthMethod,
        handleOauthPromptSubmit,
        handleOauthCallback,
        handleApiAuthSave,
        dismissOauthFlow,
        disconnectProvider,
        applyPickedModel,
        retryBrowserOauth,
        syncFlowsWithProviders,
    }
}
