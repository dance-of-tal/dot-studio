import type { Context } from 'hono'
import type { ModelSelection } from '../../shared/model-types.js'

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function readPath(value: unknown, ...keys: string[]): unknown {
    let current: unknown = value
    for (const key of keys) {
        const record = asRecord(current)
        if (!record) {
            return undefined
        }
        current = record[key]
    }
    return current
}

function readString(value: unknown, ...keys: string[]): string | undefined {
    const candidate = readPath(value, ...keys)
    return typeof candidate === 'string' ? candidate : undefined
}

function readNumber(value: unknown, ...keys: string[]): number | undefined {
    const candidate = readPath(value, ...keys)
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
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

function extractStatus(err: unknown): number | undefined {
    const candidates = [
        readNumber(err, 'status'),
        readNumber(err, 'statusCode'),
        readNumber(err, 'data', 'statusCode'),
        readNumber(err, 'response', 'status'),
        readNumber(err, 'cause', 'status'),
        readNumber(err, 'cause', 'statusCode'),
        readNumber(err, 'cause', 'response', 'status'),
    ]

    for (const candidate of candidates) {
        if (candidate !== undefined) {
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
        const error = readString(parsed, 'error')
        if (error?.trim()) {
            return error.trim()
        }
        const message = readString(parsed, 'message')
        if (message?.trim()) {
            return message.trim()
        }
    } catch {
        return body.trim()
    }

    return body.trim()
}

function sanitizeMessage(message: string): string {
    const trimmed = message.trim()
    if (!trimmed) {
        return trimmed
    }

    const firstLine = trimmed
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)

    return firstLine || trimmed
}

function extractMessage(err: unknown): string {
    const message = [
        readString(err, 'data', 'message'),
        readString(err, 'message'),
        readString(err, 'error', 'message'),
        readString(err, 'cause', 'data', 'message'),
        readString(err, 'cause', 'message'),
        extractBodyMessage(readPath(err, 'data', 'responseBody')),
        extractBodyMessage(readPath(err, 'responseBody')),
    ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)

    if (message) {
        return sanitizeMessage(message)
    }

    // Stringify raw error for debuggability — truncate if huge
    try {
        const raw = JSON.stringify(err, null, 2)
        const truncated = raw.length > 500 ? raw.slice(0, 500) + '…' : raw
        return `OpenCode request failed. Raw: ${truncated}`
    } catch {
        return 'OpenCode request failed.'
    }
}

export function isOpencodeAgentNotFoundError(err: unknown, agentName?: string | null): boolean {
    const message = extractMessage(err)
    if (!/Agent not found:/i.test(message)) {
        return false
    }
    if (!agentName?.trim()) {
        return true
    }
    return message.includes(`"${agentName}"`) || message.includes(`'${agentName}'`) || message.includes(agentName)
}

function extractProviderId(err: unknown, context: NormalizeErrorContext): string | undefined {
    return context.providerId?.trim()
        || readString(err, 'data', 'providerID')
        || readString(err, 'providerId')
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
        || /\bAll fibers interrupted without error\b/i.test(message)
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

function isSessionNotFoundError(message: string) {
    return /\bSession not found:/i.test(message)
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

    const name = typeof readString(err, 'name') === 'string'
        ? readString(err, 'name')!
        : typeof readString(err, 'error', 'name') === 'string'
            ? readString(err, 'error', 'name')!
            : 'UnknownError'
    const detail = extractMessage(err)
    const status = extractStatus(err)
    const providerId = extractProviderId(err, context)
    const modelId = context.model?.modelId
    const retryable = readPath(err, 'data', 'isRetryable') === true || (!!status && status >= 500)

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

    if (isSessionNotFoundError(detail)) {
        return {
            error: detail,
            detail,
            code: 'validation',
            action: 'refresh_studio',
            retryable: false,
            status: 404,
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
            error: /\bAll fibers interrupted without error\b/i.test(detail)
                ? 'OpenCode interrupted the current run unexpectedly. Retry in a moment, and if it keeps happening restart OpenCode from Settings.'
                : 'OpenCode is unavailable right now. Retry in a moment or restart OpenCode from Settings.',
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
    return c.json(payload, payload.status as never)
}

export function unwrapOpencodeResult<T>(result: unknown): T {
    const value = asRecord(result)
    if (value && 'error' in value && value.error) {
        throw value.error
    }
    if (value && 'data' in value) {
        return value.data as T
    }
    return result as T
}

export function unwrapPromptResult<T extends { info?: { error?: unknown } }>(result: unknown): T {
    const data = unwrapOpencodeResult<T>(result)
    if (data?.info?.error) {
        throw data.info.error
    }
    return data
}
