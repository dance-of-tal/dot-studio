import type { Context } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

export function jsonError(
    c: Context,
    message: string,
    status: 400 | 401 | 404 | 500 | 501 = 400,
) {
    return c.json({ error: message }, { status })
}

export function requestWorkingDir(c: Context): string {
    return resolveRequestWorkingDir(c)
}

export function jsonServiceFailure(
    c: Context,
    result: { ok: false; error: string; status: number },
) {
    return c.json({ error: result.error }, { status: result.status as 400 | 401 | 404 | 500 })
}
