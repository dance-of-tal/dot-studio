import type { Context } from 'hono'
import path from 'path'
import { getActiveProjectDir } from './config.js'

const WORKING_DIR_HEADER = 'x-dot-working-dir'

function normalizeWorkingDir(input: string): string | null {
    const trimmed = input.trim().replace(/\/+$/, '')
    if (!trimmed) {
        return null
    }

    return path.resolve(trimmed)
}

export function extractRequestWorkingDir(c: Context): string | null {
    const headerValue = c.req.header(WORKING_DIR_HEADER)
    if (headerValue) {
        return normalizeWorkingDir(headerValue)
    }

    const queryValue = c.req.query('workingDir')
    if (queryValue) {
        return normalizeWorkingDir(queryValue)
    }

    return null
}

export function resolveRequestWorkingDir(c: Context): string {
    return extractRequestWorkingDir(c) || getActiveProjectDir()
}

export function requestDirectoryQuery(c: Context): { directory: string } {
    return { directory: resolveRequestWorkingDir(c) }
}
