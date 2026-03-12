export type StudioApiErrorCode =
    | 'validation'
    | 'provider_auth'
    | 'model_unavailable'
    | 'runtime_unavailable'
    | 'sdk_contract'
    | 'unknown'

export type StudioApiErrorAction =
    | 'fix_input'
    | 'select_model'
    | 'choose_model'
    | 'reconnect_provider'
    | 'restart_opencode'
    | 'refresh_studio'
    | 'retry'

export type StudioApiErrorPayload = {
    error: string
    detail?: string
    code?: StudioApiErrorCode
    action?: StudioApiErrorAction
    retryable?: boolean
    status?: number
    providerId?: string
    modelId?: string
}

export class StudioApiError extends Error {
    readonly code?: StudioApiErrorCode
    readonly action?: StudioApiErrorAction
    readonly detail?: string
    readonly retryable?: boolean
    readonly status: number
    readonly providerId?: string
    readonly modelId?: string

    constructor(payload: StudioApiErrorPayload, status = 500) {
        super(payload.error || 'Request failed.')
        this.name = 'StudioApiError'
        this.code = payload.code
        this.action = payload.action
        this.detail = payload.detail
        this.retryable = payload.retryable
        this.status = payload.status || status
        this.providerId = payload.providerId
        this.modelId = payload.modelId
    }
}

export function coerceStudioApiError(error: unknown): StudioApiError {
    if (error instanceof StudioApiError) {
        return error
    }

    if (error instanceof Error) {
        return new StudioApiError({ error: error.message }, 500)
    }

    return new StudioApiError({ error: String(error || 'Request failed.') }, 500)
}

export function formatStudioApiErrorMessage(error: unknown, prefix = true): string {
    const normalized = coerceStudioApiError(error)
    const leader = prefix ? '⚠️ ' : ''
    return `${leader}${normalized.message}`
}

export function formatStudioApiErrorComment(error: unknown): string {
    const normalized = coerceStudioApiError(error)
    const lines = [`// ${normalized.message}`]

    if (normalized.code === 'unknown' && normalized.detail && normalized.detail !== normalized.message) {
        lines.push(`// Detail: ${normalized.detail}`)
    }

    return lines.join('\n')
}
