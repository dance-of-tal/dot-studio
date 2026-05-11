import { Hono } from 'hono'
import { readStoredProviderAuth } from '../lib/opencode-auth.js'
import { getOpencode } from '../lib/opencode.js'

const usage = new Hono()

// ── Types ────────────────────────────────────────────────

export type QuotaWindow = {
    percentUsed: number      // 0–100
    resetsAt: string | null  // ISO 8601
}

export type ProviderQuota = {
    connected: boolean
    authType: 'oauth' | 'api' | null
    fiveHour?: QuotaWindow
    sevenDay?: QuotaWindow
    weekly?: QuotaWindow
    error?: string
}

export type UsageResponse = {
    studio: {
        totalCostUsd: number
        inputTokens: number
        outputTokens: number
        reasoningTokens: number
    }
    codex: ProviderQuota
}

// ── Helpers ──────────────────────────────────────────────

function parseResetTime(value: unknown): string | null {
    if (!value) return null
    if (typeof value === 'string') {
        // ISO string
        const d = new Date(value)
        return isNaN(d.getTime()) ? null : d.toISOString()
    }
    if (typeof value === 'number') {
        // Unix seconds vs ms — ms is > year 2001 in seconds (> 1e9 * 1000)
        const d = value > 1e12 ? new Date(value) : new Date(value * 1000)
        return isNaN(d.getTime()) ? null : d.toISOString()
    }
    return null
}

function extractResetAt(obj: Record<string, unknown>): string | null {
    return parseResetTime(obj.resets_at ?? obj.reset_at ?? obj.resetAt ?? obj.reset_time_ms ?? null)
}

// ── Codex (ChatGPT OAuth subscription) ──────────────────

function toFinite(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return fallback
}

function parseCodexWindow(raw: Record<string, unknown>): QuotaWindow {
    // Unwrap nested rate_limit if present
    const body = raw.rate_limit && typeof raw.rate_limit === 'object'
        ? raw.rate_limit as Record<string, unknown>
        : raw
    const used = Math.max(0, Math.min(100, toFinite(body.used_percent ?? body.percent_used, 0)))
    return {
        percentUsed: used,
        resetsAt: extractResetAt(body),
    }
}

function extractCodexWindows(rlBody: Record<string, unknown>, snapshot: Record<string, unknown>) {
    const primary =
        rlBody.primary_window ?? rlBody.primary ??
        snapshot.primary_window ?? snapshot.primary
    const secondary =
        rlBody.secondary_window ?? rlBody.secondary ??
        snapshot.secondary_window ?? snapshot.secondary
    return {
        primary: primary && typeof primary === 'object' ? primary as Record<string, unknown> : null,
        secondary: secondary && typeof secondary === 'object' ? secondary as Record<string, unknown> : null,
    }
}

async function fetchCodexQuota(accessToken: string): Promise<ProviderQuota> {
    const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Origin': 'https://chatgpt.com',
            'Referer': 'https://chatgpt.com/',
        },
        signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            return { connected: true, authType: 'oauth', error: 'token_expired' }
        }
        return { connected: true, authType: 'oauth', error: `http_${res.status}` }
    }

    const data = await res.json() as Record<string, unknown>

    // rate_limit > rate_limits > rate_limits_by_limit_id.codex
    const snapshot = (
        data.rate_limit
        ?? data.rate_limits
        ?? (data.rate_limits_by_limit_id as Record<string, unknown>)?.codex
        ?? {}
    ) as Record<string, unknown>

    // Unwrap nested rate_limit body
    const rlBody = snapshot.rate_limit && typeof snapshot.rate_limit === 'object'
        ? snapshot.rate_limit as Record<string, unknown>
        : snapshot

    const { primary, secondary } = extractCodexWindows(rlBody, snapshot)

    return {
        connected: true,
        authType: 'oauth',
        // primary = session/5-hour window, secondary = weekly window
        fiveHour: primary ? parseCodexWindow(primary) : undefined,
        weekly: secondary ? parseCodexWindow(secondary) : undefined,
    }
}

// ── Studio token usage ───────────────────────────────────

function emptyStudioUsage(): UsageResponse['studio'] {
    return {
        totalCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
    }
}

async function fetchStudioUsage(directory: string): Promise<UsageResponse['studio']> {
    try {
        const oc = await getOpencode()
        const totals = emptyStudioUsage()
        const listRes = await oc.session.list({ directory })
        const sessions = listRes && typeof listRes === 'object' && 'data' in listRes
            ? (listRes as { data?: unknown[] }).data
            : null

        if (!Array.isArray(sessions)) {
            return totals
        }

        await Promise.all(sessions.map(async (session) => {
            if (!session || typeof session !== 'object') return
            const id = typeof (session as Record<string, unknown>).id === 'string'
                ? (session as Record<string, string>).id
                : null
            if (!id) return

            const messageRes = await oc.session.messages({ directory, sessionID: id }).catch(() => null)
            const messages = messageRes && typeof messageRes === 'object' && 'data' in messageRes
                ? (messageRes as { data?: unknown[] }).data
                : null
            if (!Array.isArray(messages)) return

            for (const message of messages) {
                if (!message || typeof message !== 'object') continue
                const parts = (message as Record<string, unknown>).parts
                if (!Array.isArray(parts)) continue

                for (const part of parts) {
                    if (!part || typeof part !== 'object') continue
                    const entry = part as Record<string, unknown>
                    if (typeof entry.cost === 'number' && Number.isFinite(entry.cost)) {
                        totals.totalCostUsd += entry.cost
                    }
                    const tokens = entry.tokens && typeof entry.tokens === 'object'
                        ? entry.tokens as Record<string, unknown>
                        : null
                    if (!tokens) continue
                    if (typeof tokens.input === 'number' && Number.isFinite(tokens.input)) totals.inputTokens += tokens.input
                    if (typeof tokens.output === 'number' && Number.isFinite(tokens.output)) totals.outputTokens += tokens.output
                    if (typeof tokens.reasoning === 'number' && Number.isFinite(tokens.reasoning)) totals.reasoningTokens += tokens.reasoning
                }
            }
        }))

        return {
            totalCostUsd: Number(totals.totalCostUsd.toFixed(6)),
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            reasoningTokens: totals.reasoningTokens,
        }
    } catch {
        return emptyStudioUsage()
    }
}

// ── Route ────────────────────────────────────────────────

usage.get('/api/usage', async (c) => {
    const workingDir = c.req.query('workingDir') || c.req.header('x-working-dir') || process.cwd()

    const [openaiAuth, studioStats] = await Promise.all([
        readStoredProviderAuth('openai').catch(() => null),
        fetchStudioUsage(workingDir),
    ])

    // Codex quota — only meaningful when signed in via OAuth (ChatGPT subscription)
    let codexQuota: ProviderQuota
    if (!openaiAuth) {
        codexQuota = { connected: false, authType: null }
    } else if (openaiAuth.type === 'oauth') {
        codexQuota = await fetchCodexQuota(openaiAuth.access).catch((err) => ({
            connected: true,
            authType: 'oauth' as const,
            error: err instanceof Error ? err.message : String(err),
        }))
    } else {
        // API key — wham/usage requires OAuth session token
        codexQuota = { connected: true, authType: 'api', error: 'subscription_required' }
    }

    return c.json({
        studio: studioStats,
        codex: codexQuota,
    } satisfies UsageResponse)
})

export default usage
