import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { ModelConfig } from '../../types'
import { findRuntimeModel, findRuntimeModelVariant } from '../../../shared/model-variants'

type ModelVariantSelectProps = {
    model: ModelConfig | null
    value: string | null | undefined
    onChange: (value: string | null) => void
    className?: string
    compact?: boolean
    titlePrefix?: string
    disabled?: boolean
}

export default function ModelVariantSelect({
    model,
    value,
    onChange,
    className,
    compact = false,
    titlePrefix = 'Variant',
    disabled = false,
}: ModelVariantSelectProps) {
    const { data: models = [] } = useModels(!!model)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const selectedModel = useMemo(
        () => findRuntimeModel(models, model?.provider, model?.modelId),
        [models, model?.modelId, model?.provider],
    )
    const variants = selectedModel?.variants || []
    const selectedVariant = useMemo(
        () => findRuntimeModelVariant(models, model?.provider, model?.modelId, value || null),
        [models, model?.modelId, model?.provider, value],
    )

    useEffect(() => {
        if (value && !selectedVariant) {
            onChange(null)
        }
    }, [onChange, selectedVariant, value])

    useEffect(() => {
        if (!open) {
            setQuery('')
            return
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
        }
    }, [open])

    if (!model || variants.length === 0) {
        return null
    }

    const filteredVariants = deferredQuery
        ? variants.filter((variant) => {
            const haystack = `${variant.id} ${variant.summary}`.toLowerCase()
            return haystack.includes(deferredQuery)
        })
        : variants

    const buttonTitle = value
        ? `${titlePrefix}: ${value}${selectedVariant?.summary ? ` · ${selectedVariant.summary}` : ''}`
        : `${titlePrefix}: default`

    return (
        <div className={className || 'model-variant-select'} ref={wrapperRef}>
            {!compact ? <span>Variant</span> : null}
            <button
                type="button"
                className="model-variant-select__trigger"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                title={buttonTitle}
                aria-expanded={open}
            >
                <span className="model-variant-select__trigger-label">{value || 'Default'}</span>
                <ChevronDown size={12} />
            </button>
            {open ? (
                <div className="model-variant-select__popover">
                    <label className="model-variant-select__search">
                        <Search size={12} />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search variants"
                        />
                    </label>
                    <div className="model-variant-select__options">
                        <button
                            type="button"
                            className={`model-variant-select__option ${!value ? 'is-selected' : ''}`}
                            onClick={() => {
                                onChange(null)
                                setOpen(false)
                            }}
                            title={`${titlePrefix}: default`}
                        >
                            <span>Default</span>
                            <small>Use the model default runtime preset</small>
                        </button>
                        {filteredVariants.map((variant) => (
                            <button
                                key={variant.id}
                                type="button"
                                className={`model-variant-select__option ${value === variant.id ? 'is-selected' : ''}`}
                                onClick={() => {
                                    onChange(variant.id)
                                    setOpen(false)
                                }}
                                title={`${variant.id} · ${variant.summary}`}
                            >
                                <span>{variant.id}</span>
                                <small>{variant.summary}</small>
                            </button>
                        ))}
                        {filteredVariants.length === 0 ? (
                            <div className="model-variant-select__empty">No variants match this model.</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
