import type { Context } from 'hono'

export function jsonError(
    c: Context,
    message: string,
    status: 400 | 401 | 404 | 500 | 501 = 400,
) {
    return c.json({ error: message }, { status })
}
