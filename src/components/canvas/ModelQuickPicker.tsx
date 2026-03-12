import { useEffect, useMemo, useState } from 'react'
import { Cpu, Search, X } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { ModelConfig } from '../../types'
import './ModelQuickPicker.css'

type ModelQuickPickerProps = {
    open: boolean
    currentModel: ModelConfig | null
    onSelect: (model: ModelConfig) => void
    onClose: () => void
    title?: string
}

export default function ModelQuickPicker({
    open,
    currentModel,
    onSelect,
    onClose,
    title = 'Choose a model',
}: ModelQuickPickerProps) {
    const { data: models = [] } = useModels(open)
    const [providerFilter, setProviderFilter] = useState<string>('all')
    const [query, setQuery] = useState('')

    useEffect(() => {
        if (!open) {
            return
        }
        setProviderFilter(currentModel?.provider || 'all')
        setQuery('')
    }, [currentModel?.provider, open])

    const readyModels = useMemo(
        () => models.filter((model) => model.connected),
        [models],
    )
    const providers = useMemo(
        () => Array.from(new Set(readyModels.map((model) => model.provider))),
        [readyModels],
    )
    const visibleModels = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return readyModels.filter((model) => {
            if (providerFilter !== 'all' && model.provider !== providerFilter) {
                return false
            }
            if (!normalizedQuery) {
                return true
            }
            return [
                model.name,
                model.id,
                model.provider,
                model.providerName,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedQuery))
        })
    }, [providerFilter, query, readyModels])

    if (!open) {
        return null
    }

    return (
        <div className="model-quick-picker" onClick={(event) => event.stopPropagation()}>
            <div className="model-quick-picker__header">
                <div>
                    <strong>{title}</strong>
                    <span>Ready models from the current OpenCode runtime.</span>
                </div>
                <button
                    type="button"
                    className="icon-btn"
                    onClick={onClose}
                    title="Close model picker"
                >
                    <X size={12} />
                </button>
            </div>
            <div className="model-quick-picker__controls">
                <label className="model-quick-picker__search">
                    <Search size={12} />
                    <input
                        className="text-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search ready models"
                    />
                </label>
                <div className="model-quick-picker__providers">
                    <button
                        type="button"
                        className={`model-quick-picker__provider ${providerFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setProviderFilter('all')}
                    >
                        All
                    </button>
                    {providers.map((provider) => (
                        <button
                            key={provider}
                            type="button"
                            className={`model-quick-picker__provider ${providerFilter === provider ? 'active' : ''}`}
                            onClick={() => setProviderFilter(provider)}
                        >
                            {provider}
                        </button>
                    ))}
                </div>
            </div>
            <div className="model-quick-picker__list">
                {visibleModels.length === 0 ? (
                    <div className="model-quick-picker__empty">No ready models match this filter.</div>
                ) : visibleModels.map((model) => {
                    const selected = currentModel?.provider === model.provider && currentModel?.modelId === model.id
                    return (
                        <button
                            key={`${model.provider}:${model.id}`}
                            type="button"
                            className={`model-quick-picker__item ${selected ? 'is-selected' : ''}`}
                            onClick={() => onSelect({ provider: model.provider, modelId: model.id })}
                        >
                            <span className="model-quick-picker__item-icon">
                                <Cpu size={12} />
                            </span>
                            <span className="model-quick-picker__item-copy">
                                <strong>{model.name || model.id}</strong>
                                <span>{model.providerName} · {model.id}</span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
