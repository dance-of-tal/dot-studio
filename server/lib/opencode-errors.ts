import type { Context } from 'hono'
import type { ModelSelection } from './prompt.js'

export type StudioOpencodeErrorCode =
    | 'validation'
    | 'provider_auth'
    | 'model_unavailable'
    | 'context_overflow'
    | 'structured_output'
    | 'runtime_unavailable'
    | 'sdk_contract'
    | 'unknown'

export type StudioOpencodeErrorAction =
    | 'fix_input'
    | 'select_model'
    | 'choose_model'
    | 'reduce_context'
    | 'reconnect_provider'
    | 'restart_opencode'
    | 'refresh_studio'
    | 'retry'

export type StudioOpencodeErrorPayload = {
    error: string
    detail: string
    code: StudioOpencodeErrorCode
    action: StudioOpencodeErrorAction
    retryable: boolean
    status: number
    providerId?: string
    modelId?: string
}

type NormalizeErrorContext = {
    providerId?: string | null
    model?: ModelSelection
    defaultStatus?: number
}

export class StudioValidationError extends Error {
    readonly action: StudioOpencodeErrorAction
    readonly status: number

    constructor(
        message: string,
        action: StudioOpencodeErrorAction = 'fix_input',
        status = 400,
    ) {
        super(message)
        this.name = 'StudioValidationError'
        this.action = action
        this.status = status
    }
}

function extractStatus(err: any): number | undefined {
    const candidates = [
        err?.status,
        err?.statusCode,
        err?.data?.statusCode,
        err?.response?.status,
        err?.cause?.status,
        err?.cause?.statusCode,
        err?.cause?.response?.status,
    ]

    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return candidate
        }
    }

    return undefined
}

function extractBodyMessage(body: unknown): string | null {
    if (typeof body !== 'string' || !body.trim()) {
        return null
    }

    try {
        const parsed = JSON.parse(body)
        if (parsed && typeof parsed === 'object') {
            if (typeof (parsed as any).error === 'string' && (parsed as any).error.trim()) {
                return (parsed as any).error.trim()
            }
            if (typeof (parsed as any).message === 'string' && (parsed as any).message.trim()) {
                return (parsed as any).message.trim()
            }
        }
    } catch {
        return body.trim()
    }

    return body.trim()
}

function extractMessage(err: any): string {
    const message = [
        err?.data?.message,
        err?.message,
        err?.error?.message,
        err?.cause?.data?.message,
        err?.cause?.message,
        extractBodyMessage(err?.data?.responseBody),
        extractBodyMessage(err?.responseBody),
    ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)

    return message || 'OpenCode request failed.'
}

function extractProviderId(err: any, context: NormalizeErrorContext): string | undefined {
    return context.providerId?.trim()
        || err?.data?.providerID
        || err?.providerId
        || context.model?.provider
        || undefined
}

function isProviderAuthError(name: string, message: string, status?: number) {
    return name === 'ProviderAuthError'
        || status === 401
        || status === 403
        || /\b(unauthorized|forbidden|authentication|auth\b|api key|credentials?|token expired|provider auth)\b/i.test(message)
}

function isModelUnavailableError(message: string) {
    return /\b(model|provider\/model)\b/i.test(message)
        && /\b(not found|not available|unavailable|unsupported|unknown|invalid|does not exist|missing)\b/i.test(message)
}

function isRuntimeUnavailableError(message: string, status?: number) {
    return status === 502
        || status === 503
        || status === 504
        || /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|failed to fetch|network error|connection refused|service unavailable|gateway timeout)\b/i.test(message)
}

function isStructuredOutputError(name: string, message: string) {
    return name === 'StructuredOutputError'
        || /\b(structured output|json schema|output schema|format validation)\b/i.test(message)
}

function isContextOverflowError(name: string, message: string) {
    return name === 'ContextOverflowError'
        || /\b(context overflow|context window|prompt is too long|too many tokens|maximum context|exceeds context)\b/i.test(message)
}

function isSdkContractError(message: string, status?: number) {
    return status === 404
        || /\b(no body in sse response|unexpected response|response validation|invalid response|failed to parse|cannot read properties of undefined|not implemented)\b/i.test(message)
}

export function normalizeOpencodeError(
    err: unknown,
    context: NormalizeErrorContext = {},
): StudioOpencodeErrorPayload {
    if (err instanceof StudioValidationError) {
        return {
            error: err.message,
            detail: err.message,
            code: 'validation',
            action: err.action,
            retryable: false,
            status: err.status,
        }
    }

    const raw = err as any
    const name = typeof raw?.name === 'string'
        ? raw.name
        : typeof raw?.error?.name === 'string'
            ? raw.error.name
            : 'UnknownError'
    const detail = extractMessage(raw)
    const status = extractStatus(raw)
    const providerId = extractProviderId(raw, context)
    const modelId = context.model?.modelId
    const retryable = raw?.data?.isRetryable === true || (!!status && status >= 500)

    if (isProviderAuthError(name, detail, status)) {
        return {
            error: `Provider authentication is missing or expired${providerId ? ` for ${providerId}` : ''}. Reconnect it in Settings and try again.`,
            detail,
            code: 'provider_auth',
            action: 'reconnect_provider',
            retryable: false,
            status: status || 401,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isModelUnavailableError(detail)) {
        return {
            error: `The selected model${modelId ? ` (${modelId})` : ''} is unavailable. Choose another model for this performer and try again.`,
            detail,
            code: 'model_unavailable',
            action: 'choose_model',
            retryable: false,
            status: status || 404,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isContextOverflowError(name, detail)) {
        return {
            error: 'The current context is too large for the selected model. Reduce context, switch variants, or choose a model with a larger window.',
            detail,
            code: 'context_overflow',
            action: 'reduce_context',
            retryable: false,
            status: status || 400,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isStructuredOutputError(name, detail)) {
        return {
            error: 'OpenCode could not satisfy the required structured output format. Retry, simplify the task, or adjust the current act node.',
            detail,
            code: 'structured_output',
            action: 'retry',
            retryable: true,
            status: status || 422,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isRuntimeUnavailableError(detail, status)) {
        return {
            error: 'OpenCode is unavailable right now. Retry in a moment or restart OpenCode from Settings.',
            detail,
            code: 'runtime_unavailable',
            action: 'restart_opencode',
            retryable: true,
            status: status || 503,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isSdkContractError(detail, status)) {
        return {
            error: 'Studio could not complete this request because the OpenCode API contract looks incompatible. Refresh Studio or restart OpenCode.',
            detail,
            code: 'sdk_contract',
            action: 'refresh_studio',
            retryable: false,
            status: status || 502,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    return {
        error: detail,
        detail,
        code: 'unknown',
        action: retryable ? 'retry' : 'fix_input',
        retryable,
        status: status || context.defaultStatus || 500,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    }
}

export function jsonOpencodeError(
    c: Context,
    err: unknown,
    context: NormalizeErrorContext = {},
) {
    const payload = normalizeOpencodeError(err, context)
    return c.json(payload, payload.status as any)
}

export function unwrapOpencodeResult<T>(result: unknown): T {
    const value = result as any
    if (value && typeof value === 'object' && 'error' in value && value.error) {
        throw value.error
    }
    if (value && typeof value === 'object' && 'data' in value) {
        return value.data as T
    }
    return value as T
}

export function unwrapPromptResult<T extends { info?: any }>(result: unknown): T {
    const data = unwrapOpencodeResult<T>(result)
    if (data?.info?.error) {
        throw data.info.error
    }
    return data
}
