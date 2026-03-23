import { StudioApiError } from './lib/api-errors'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
let workingDirContext: string | null = null

export type WorkspaceFileEntry =
    | string
    | {
        name: string
        path: string
        absolute: string
        type: string
    }

export function resolveWorkingDirContext() {
    return workingDirContext
}

function withWorkingDirQuery(url: string, workingDir: string | null) {
    if (!workingDir) {
        return url
    }
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}workingDir=${encodeURIComponent(workingDir)}`
}

export function setApiWorkingDirContext(workingDir: string | null) {
    workingDirContext = workingDir?.trim() ? workingDir.trim() : null
}

export function absolutizeWorkspacePath(path: string, workingDir: string | null) {
    if (!path) {
        return path
    }
    if (path.startsWith('/') || path.startsWith('file://') || !workingDir) {
        return path
    }
    return `${workingDir.replace(/\/+$/, '')}/${path.replace(/^\.?\//, '')}`
}

function withApiBase(url: string) {
    return `${API_BASE}${withWorkingDirQuery(url, resolveWorkingDirContext())}`
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const workingDir = resolveWorkingDirContext()
    const res = await fetch(withApiBase(url), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(workingDir ? { 'X-DOT-Working-Dir': workingDir } : {}),
            ...init?.headers,
        },
    })
    if (!res.ok) {
        const raw = await res.text().catch(() => '')
        let payload: { error?: string } & Record<string, unknown> = { error: raw || res.statusText }
        if (raw) {
            try {
                const parsed = JSON.parse(raw)
                payload = parsed && typeof parsed === 'object'
                    ? parsed as { error?: string } & Record<string, unknown>
                    : { error: raw }
            } catch {
                payload = { error: raw }
            }
        }
        throw new StudioApiError(payload, res.status)
    }
    return res.json()
}

export function postJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'POST',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function putJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'PUT',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function patchJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'PATCH',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function deleteJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'DELETE',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function createApiEventSource(url: string) {
    return new EventSource(withApiBase(url))
}

export function normalizeWorkspaceFileEntry(entry: WorkspaceFileEntry) {
    if (typeof entry === 'string') {
        return {
            name: entry.split('/').pop() || entry,
            path: entry,
            absolute: absolutizeWorkspacePath(entry, resolveWorkingDirContext()),
            type: 'file',
        }
    }
    return {
        name: entry.name,
        path: entry.path,
        absolute: absolutizeWorkspacePath(entry.absolute || entry.path, resolveWorkingDirContext()),
        type: entry.type,
    }
}
