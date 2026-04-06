import type { MiddlewareHandler } from 'hono'

const SLOW_REQUEST_MS = 1000
const QUIET_PATHS = new Set(['/health', '/api/health'])

function sanitizePath(path: string) {
    return path.replace(/\/+$/, '') || '/'
}

export function isVerboseServerLoggingEnabled() {
    return process.env.STUDIO_VERBOSE_SERVER_LOGS === '1'
}

export function serverDebug(scope: string, message: string, ...args: unknown[]) {
    if (!isVerboseServerLoggingEnabled()) {
        return
    }

    if (args.length > 0) {
        console.debug(`[${scope}] ${message}`, ...args)
        return
    }

    console.debug(`[${scope}] ${message}`)
}

export function serverInfo(scope: string, message: string, ...args: unknown[]) {
    if (args.length > 0) {
        console.info(`[${scope}] ${message}`, ...args)
        return
    }

    console.info(`[${scope}] ${message}`)
}

export function shouldLogRequest(path: string, status: number, durationMs: number) {
    const normalizedPath = sanitizePath(path)
    if (QUIET_PATHS.has(normalizedPath) && status < 400 && durationMs < SLOW_REQUEST_MS) {
        return false
    }

    return status >= 400 || durationMs >= SLOW_REQUEST_MS
}

export const requestLogger: MiddlewareHandler = async (c, next) => {
    const startedAt = Date.now()
    const path = sanitizePath(new URL(c.req.url).pathname)

    try {
        await next()
    } catch (error) {
        const durationMs = Date.now() - startedAt
        console.error(`[http] ${c.req.method} ${path} 500 ${durationMs}ms`, error)
        throw error
    }

    const durationMs = Date.now() - startedAt
    const status = c.res.status

    if (!shouldLogRequest(path, status, durationMs)) {
        return
    }

    const summary = `${c.req.method} ${path} ${status} ${durationMs}ms`
    if (status >= 500) {
        console.error(`[http] ${summary}`)
        return
    }

    console.warn(`[http] ${summary}`)
}
