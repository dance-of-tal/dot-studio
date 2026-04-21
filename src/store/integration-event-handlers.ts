/**
 * Event handlers for the chat EventSource stream.
 *
 * Each handler corresponds to one SSE event type inside `reconnectEventSource.onmessage`.
 * They are pure functions of `(data, get, set)` so the dispatcher in integrationSlice
 * stays thin.
 */

import type { StudioState } from './types'
import { queryClient } from '../lib/query-client'
import { showToast } from '../lib/toast'

type GetFn = () => StudioState

function invalidateRuntimeQueries(workingDir: string) {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', workingDir] })
    queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
}

// ── mcp.tools.changed ──

export function handleMcpToolsChanged(get: GetFn) {
    invalidateRuntimeQueries(get().workingDir)
}

// ── mcp.browser.open.failed ──

export function handleMcpBrowserOpenFailed(data: { type?: string; properties?: { mcpName?: unknown; url?: unknown } }) {
    const mcpName = data.properties?.mcpName
    const url = data.properties?.url
    if (typeof mcpName !== 'string' || typeof url !== 'string' || !url.trim()) {
        return
    }
    showToast(`Studio could not open the browser for MCP auth (${mcpName}).`, 'warning', {
        title: 'MCP auth needs browser',
        actionLabel: 'Open auth',
        onAction: () => {
            window.open(url, '_blank')
        },
        dedupeKey: `mcp-auth-open:${mcpName}`,
        durationMs: 8000,
    })
}

// Chat/session event reducers are handled by `session/event-ingest.ts`.
