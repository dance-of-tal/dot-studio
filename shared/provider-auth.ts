export type ProviderAuthPromptRule = {
    key: string
    op: 'eq' | 'neq'
    value: string
}

export type ProviderAuthPromptOption = {
    label: string
    value: string
    hint?: string
}

export type ProviderAuthPrompt =
    | {
        type: 'text'
        key: string
        message: string
        placeholder?: string
        when?: ProviderAuthPromptRule
    }
    | {
        type: 'select'
        key: string
        message: string
        options: ProviderAuthPromptOption[]
        when?: ProviderAuthPromptRule
    }

export type ProviderAuthMethod = {
    type: 'oauth' | 'api'
    label: string
    prompts?: ProviderAuthPrompt[]
}

export type ProviderAuthMethodMap = Record<string, ProviderAuthMethod[]>

export type ProviderOauthAuthorization = {
    method: 'auto' | 'code'
    url?: string
    instructions?: string
}

export type ProviderOauthAuthorizeRequest = {
    method: number
    inputs?: Record<string, string>
}

export type ProviderOauthCallbackRequest = {
    method: number
    code?: string
}

export type ProviderStoredOauthAuth = {
    type: 'oauth'
    refresh: string
    access: string
    expires: number
    enterpriseUrl?: string
    accountId?: string
}

export type ProviderApiKeyAuth = {
    type: 'api'
    key: string
    metadata?: Record<string, string>
}

export type ProviderWellKnownAuth = {
    type: 'wellknown'
    key: string
    token: string
}

export type ProviderAuthInput =
    | ProviderStoredOauthAuth
    | ProviderApiKeyAuth
    | ProviderWellKnownAuth

export type ProviderSummary = {
    id: string
    name: string
    source: string
    env: string[]
    connected: boolean
    modelCount: number
    defaultModel: string | null
    hasPaidModels: boolean
}
