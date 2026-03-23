/**
 * Event handlers for the chat EventSource stream.
 *
 * Each handler corresponds to one SSE event type inside `reconnectEventSource.onmessage`.
 * They are pure functions of `(data, get, set)` so the dispatcher in integrationSlice
 * stays thin.
 */

import type { StudioState } from './types'
import type { LspDiagnostic } from '../types'
import {
    diagnosticMatchesWorkingDir,
    invalidateRuntimeQueries,
} from './integration-streaming'
import { showToast } from '../lib/toast'
export {
    handleMessageUpdated,
    handleMessagePartUpdated,
    handleMessagePartDelta,
    handleMessagePartRemoved,
} from './integration-message-handlers'
export {
    handleSessionStatus,
    handleSessionIdle,
    handleSessionCompacted,
    handleSessionError,
    handlePermissionAsked,
    handlePermissionReplied,
    handleQuestionAsked,
    handleQuestionReplied,
    handleTodoUpdated,
} from './integration-session-handlers'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

// ── lsp.client.diagnostics ──

export function handleLspDiagnostics(
    data: { properties?: { uri?: unknown; diagnostics?: unknown } },
    get: GetFn,
    set: SetFn,
) {
    const { uri, diagnostics } = data.properties || {}
    if (typeof uri !== 'string' || !diagnosticMatchesWorkingDir(uri, get().workingDir)) {
        return
    }
    const normalizedDiagnostics: LspDiagnostic[] = Array.isArray(diagnostics)
        ? diagnostics.filter((item): item is LspDiagnostic => !!item && typeof item === 'object' && typeof (item as LspDiagnostic).message === 'string')
        : []
    set((state) => ({
        lspDiagnostics: {
            ...state.lspDiagnostics,
            [uri]: normalizedDiagnostics,
        },
    }))
}

// ── lsp.updated ──

export function handleLspUpdated(get: GetFn) {
    get().fetchLspStatus()
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

// ── message.updated ──
