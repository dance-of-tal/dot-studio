import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, Zap, Clock } from 'lucide-react'
import { api } from '../../api'

type QuotaWindow = {
    percentUsed: number
    resetsAt: string | null
}

type ProviderQuota = {
    connected: boolean
    authType: 'oauth' | 'api' | null
    fiveHour?: QuotaWindow
    sevenDay?: QuotaWindow
    weekly?: QuotaWindow
    error?: string
}

type UsageData = {
    studio: {
        totalCostUsd: number
        inputTokens: number
        outputTokens: number
        reasoningTokens: number
    }
    codex: ProviderQuota
}

// ── Helpers ──────────────────────────────────────────────

function formatResetAt(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    if (diffMs <= 0) return 'now'
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 60) return `${diffMin}m`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m`
    return `${Math.floor(diffHr / 24)}d ${diffHr % 24}h`
}

function quotaColor(percentUsed: number): string {
    if (percentUsed >= 90) return 'var(--status-danger, #ef4444)'
    if (percentUsed >= 70) return 'var(--status-warning, #f59e0b)'
    return 'var(--status-success, #22c55e)'
}

function formatTokenCount(value: number): string {
    return Math.max(0, Math.round(value)).toLocaleString()
}

function formatCost(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '$0.00'
    if (value < 0.01) return `$${value.toFixed(4)}`
    return `$${value.toFixed(2)}`
}

// ── QuotaBar ─────────────────────────────────────────────

function QuotaBar({ window: w, label }: { window: QuotaWindow; label: string }) {
    const pct = Math.min(100, Math.max(0, w.percentUsed))
    const remaining = 100 - pct
    const color = quotaColor(pct)

    return (
        <div className="stg-row using-quota-row">
            <div className="stg-row__text">
                <span className="stg-row__title">{label}</span>
                <span className="stg-row__desc">
                    <Clock size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                    resets in {formatResetAt(w.resetsAt)}
                </span>
            </div>
            <div className="using-quota-right">
                <span className="using-quota-pct" style={{ color }}>
                    {remaining.toFixed(0)}% left
                </span>
                <div className="using-bar-bg using-bar-bg--wide">
                    <div
                        className="using-bar-fill"
                        style={{ width: `${pct}%`, background: color }}
                    />
                </div>
            </div>
        </div>
    )
}

// ── ProviderSection ──────────────────────────────────────

function ProviderSection({ title, quota }: { title: string; quota: ProviderQuota }) {
    if (!quota.connected) {
        return (
            <div className="using-notice">
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>
                    {title} provider not connected.
                    Go to <strong>Providers</strong> to connect.
                </span>
            </div>
        )
    }

    if (quota.authType === 'api') {
        return (
            <div className="using-notice">
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>
                    Connected via API key — quota data requires a subscription login (OAuth).
                </span>
            </div>
        )
    }

    if (quota.error === 'token_expired') {
        return (
            <div className="using-notice using-notice--warn">
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>Session token expired. Reconnect {title} in <strong>Providers</strong>.</span>
            </div>
        )
    }

    if (quota.error === 'rate_limited') {
        return (
            <div className="using-notice using-notice--warn">
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>Usage endpoint is rate-limited. Try again in a moment.</span>
            </div>
        )
    }

    if (quota.error) {
        return (
            <div className="using-notice using-notice--danger">
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>Could not fetch usage: {quota.error}</span>
            </div>
        )
    }

    const windows = [
        quota.fiveHour ? { w: quota.fiveHour, label: '5-hour window' } : null,
        quota.sevenDay ? { w: quota.sevenDay, label: '7-day window' } : null,
        quota.weekly   ? { w: quota.weekly,   label: 'Weekly window' } : null,
    ].filter(Boolean) as { w: QuotaWindow; label: string }[]

    if (windows.length === 0) {
        return (
            <div className="using-notice">
                <span>No quota data returned. You may be on a plan without usage limits.</span>
            </div>
        )
    }

    return (
        <div className="stg-group">
            {windows.map(({ w, label }) => (
                <QuotaBar key={label} window={w} label={label} />
            ))}
        </div>
    )
}

// ── StudioSection ────────────────────────────────────────

function StudioSection({ studio }: { studio: UsageData['studio'] }) {
    return (
        <div className="stg-section">
            <h3 className="stg-section__title">
                <Zap size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                dot-studio
            </h3>
            <div className="stg-group">
                <div className="stg-row">
                    <div className="stg-row__text">
                        <span className="stg-row__title">Estimated cost</span>
                        <span className="stg-row__desc">Recorded model spend in this workspace</span>
                    </div>
                    <span className="using-badge">{formatCost(studio.totalCostUsd)}</span>
                </div>
                <div className="stg-row">
                    <div className="stg-row__text">
                        <span className="stg-row__title">Input tokens</span>
                        <span className="stg-row__desc">Prompt and context tokens sent</span>
                    </div>
                    <span className="using-badge">{formatTokenCount(studio.inputTokens)}</span>
                </div>
                <div className="stg-row">
                    <div className="stg-row__text">
                        <span className="stg-row__title">Output tokens</span>
                        <span className="stg-row__desc">Assistant response tokens received</span>
                    </div>
                    <span className="using-badge">{formatTokenCount(studio.outputTokens)}</span>
                </div>
                <div className="stg-row">
                    <div className="stg-row__text">
                        <span className="stg-row__title">Reasoning tokens</span>
                        <span className="stg-row__desc">Internal reasoning tokens reported</span>
                    </div>
                    <span className="using-badge">{formatTokenCount(studio.reasoningTokens)}</span>
                </div>
            </div>
        </div>
    )
}

// ── Main component ───────────────────────────────────────

export default function SettingsUsing() {
    const [data, setData] = useState<UsageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        setFetchError(null)
        try {
            setData(await api.usage.get())
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])

    return (
        <div className="stg-panel">
            <div className="stg-panel__header stg-panel__header--split">
                <h2 className="stg-panel__title">Using</h2>
                <button
                    className="icon-btn"
                    onClick={() => { void load() }}
                    disabled={loading}
                    aria-label="Refresh usage"
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {fetchError && (
                <div className="alert alert--danger" style={{ marginBottom: 16 }}>
                    {fetchError}
                </div>
            )}

            {loading && !data ? (
                <div className="empty-state">Loading usage data…</div>
            ) : (
                <>
                    {data && <StudioSection studio={data.studio} />}

                    {/* Codex */}
                    <div className="stg-section">
                        <h3 className="stg-section__title">Codex (ChatGPT)</h3>
                        {data && <ProviderSection title="OpenAI" quota={data.codex} />}
                    </div>
                </>
            )}
        </div>
    )
}
