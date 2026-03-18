import { useEffect, useMemo } from 'react'
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

    if (!model || variants.length === 0) {
        return null
    }

    return (
        <label className={className || 'model-variant-select'}>
            {!compact ? <span>Variant</span> : null}
            <select
                className="select"
                value={value || ''}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value || null)}
                title={value
                    ? `${titlePrefix}: ${value}${selectedVariant?.summary ? ` · ${selectedVariant.summary}` : ''}`
                    : `${titlePrefix}: default`}
            >
                <option value="">Default</option>
                {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                        {variant.id}
                    </option>
                ))}
            </select>
        </label>
    )
}
