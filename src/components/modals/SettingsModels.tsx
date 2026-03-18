/**
 * SettingsModels — Connected model browser.
 * Shows all available connected models grouped by provider (read-only).
 */

import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { api } from '../../api'

interface ModelEntry {
    id: string
    name: string
    provider: string
    providerName: string
    toolCall: boolean
    reasoning: boolean
    connected: boolean
}

interface ProviderGroup {
    providerId: string
    providerName: string
    models: ModelEntry[]
}

export default function SettingsModels() {
    const [models, setModels] = useState<ModelEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')

    useEffect(() => {
        let cancelled = false
        async function load() {
            setLoading(true)
            try {
                const list = await api.models.list()
                if (cancelled) return
                const entries: ModelEntry[] = (list || []).map((m: any) => ({
                    id: m.id,
                    name: m.name || m.id,
                    provider: m.provider,
                    providerName: m.providerName || m.provider,
                    toolCall: !!m.toolCall,
                    reasoning: !!m.reasoning,
                    connected: !!m.connected,
                }))
                setModels(entries)
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return models.filter((m) => m.connected)
        return models
            .filter((m) => m.connected)
            .filter((m) =>
                `${m.name} ${m.id} ${m.providerName}`.toLowerCase().includes(q),
            )
    }, [models, query])

    const groups = useMemo(() => {
        const map = new Map<string, ProviderGroup>()
        for (const m of filtered) {
            let g = map.get(m.provider)
            if (!g) {
                g = { providerId: m.provider, providerName: m.providerName, models: [] }
                map.set(m.provider, g)
            }
            g.models.push(m)
        }
        const result = Array.from(map.values())
        result.sort((a, b) => a.providerName.localeCompare(b.providerName))
        for (const g of result) {
            g.models.sort((a, b) => a.name.localeCompare(b.name))
        }
        return result
    }, [filtered])

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">Models</h2>
            </div>

            <div className="stg-search">
                <Search size={14} className="stg-search__icon" />
                <input
                    className="stg-search__input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search models…"
                    spellCheck={false}
                    autoComplete="off"
                />
                {query && (
                    <button className="icon-btn" onClick={() => setQuery('')}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {loading ? (
                <div className="stg-empty">Loading models…</div>
            ) : groups.length === 0 ? (
                <div className="stg-empty">
                    {query ? `No models matching "${query}"` : 'No connected models available.'}
                </div>
            ) : (
                <div className="stg-models-list">
                    {groups.map((group) => (
                        <div key={group.providerId} className="stg-section">
                            <h3 className="stg-section__title">{group.providerName}</h3>
                            <div className="stg-group">
                                {group.models.map((model) => {
                                    const key = `${model.provider}:${model.id}`
                                    return (
                                        <div key={key} className="stg-row">
                                            <div className="stg-row__text">
                                                <span className="stg-row__title">{model.name}</span>
                                                <span className="stg-row__desc">
                                                    {model.id}
                                                    {model.toolCall ? ' · tools' : ''}
                                                    {model.reasoning ? ' · reasoning' : ''}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
