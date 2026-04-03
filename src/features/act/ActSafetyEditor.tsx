import { useState, useCallback } from 'react'
import { Shield, ChevronDown, ChevronRight } from 'lucide-react'
import { useStudioStore } from '../../store'
import type { WorkspaceAct } from '../../types'
import Tip from './Tip'

type SafetyFields = NonNullable<WorkspaceAct['safety']>

interface SafetyField {
    key: keyof SafetyFields
    label: string
    tooltip: string
    defaultValue: number
    unit: string
    min: number
    max: number
    step: number
    /** If set, display/edit in this unit but store in ms */
    displayDivisor?: number
}

const SAFETY_FIELDS: SafetyField[] = [
    {
        key: 'maxEvents',
        label: 'Max Events',
        tooltip: 'Total event limit for the thread. The runtime halts when this is exceeded.',
        defaultValue: 300,
        unit: 'events',
        min: 10,
        max: 5000,
        step: 10,
    },
    {
        key: 'maxMessagesPerPair',
        label: 'Max Messages per Pair',
        tooltip: 'Maximum messages between any two participants per thread. Prevents runaway conversations.',
        defaultValue: 20,
        unit: 'messages',
        min: 5,
        max: 500,
        step: 5,
    },
    {
        key: 'maxBoardUpdatesPerKey',
        label: 'Max Board Updates per Key',
        tooltip: 'Maximum updates to a single shared board key. Prevents infinite update loops.',
        defaultValue: 50,
        unit: 'updates',
        min: 5,
        max: 500,
        step: 5,
    },
    {
        key: 'quietWindowMs',
        label: 'Idle Quiet Window',
        tooltip: 'Seconds of inactivity before the runtime considers participants idle.',
        defaultValue: 45,
        unit: 'seconds',
        min: 10,
        max: 600,
        step: 10,
        displayDivisor: 1000,
    },
    {
        key: 'loopDetectionThreshold',
        label: 'Loop Detection',
        tooltip: 'Number of rapid back-and-forth alternations that triggers a loop circuit-breaker.',
        defaultValue: 4,
        unit: 'alternations',
        min: 2,
        max: 50,
        step: 1,
    },
    {
        key: 'threadTimeoutMs',
        label: 'Thread Timeout',
        tooltip: 'Maximum thread lifetime in minutes. The thread is interrupted after this duration.',
        defaultValue: 15,
        unit: 'minutes',
        min: 1,
        max: 120,
        step: 1,
        displayDivisor: 60_000,
    },
]

export default function ActSafetyEditor({ actId }: { actId: string }) {
    const act = useStudioStore((s) => s.acts.find((a) => a.id === actId))
    const updateActSafety = useStudioStore((s) => s.updateActSafety)
    const [expanded, setExpanded] = useState(false)

    const safety = act?.safety

    const handleChange = useCallback((key: keyof SafetyFields, value: number, field: SafetyField) => {
        if (!act) return
        const clamped = Math.max(field.min, Math.min(field.max, value))
        const stored = field.displayDivisor ? clamped * field.displayDivisor : clamped
        const next = { ...(safety || {}), [key]: stored }
        // Remove fields that equal the default (keep payload lean)
        const defaultStored = field.displayDivisor ? field.defaultValue * field.displayDivisor : field.defaultValue
        if (stored === defaultStored) {
            delete next[key]
        }
        const hasValues = Object.keys(next).length > 0
        updateActSafety(actId, hasValues ? next : undefined)
    }, [act, safety, actId, updateActSafety])

    const getDisplayValue = (field: SafetyField): number => {
        const raw = safety?.[field.key]
        if (raw == null) return field.defaultValue
        return field.displayDivisor ? Math.round(raw / field.displayDivisor) : raw
    }

    const isCustomized = Object.keys(safety || {}).length > 0

    if (!act) return null

    return (
        <div className="adv-section act-safety">
            <button
                type="button"
                className="adv-section__head act-safety__toggle"
                onClick={() => setExpanded(!expanded)}
            >
                <span className="section-title act-safety__title">
                    <Shield size={12} />
                    Safety
                    {isCustomized && <span className="act-safety__customized">Customized</span>}
                </span>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {expanded && (
                <div className="adv-section__body">
                    <div className="act-safety__fields">
                        {SAFETY_FIELDS.map((field) => {
                            const displayValue = getDisplayValue(field)
                            return (
                                <div key={field.key} className="act-safety__field">
                                    <div className="act-safety__field-header">
                                        <span className="act-safety__field-label">
                                            {field.label}
                                            <Tip text={field.tooltip} />
                                        </span>
                                    </div>
                                    <div className="act-safety__input-row">
                                        <input
                                            type="number"
                                            className="text-input act-panel__input--number"
                                            min={field.min}
                                            max={field.max}
                                            step={field.step}
                                            value={displayValue}
                                            onChange={(e) => handleChange(field.key, Number(e.target.value), field)}
                                        />
                                        <span className="act-safety__unit">{field.unit}</span>
                                    </div>
                                </div>
                            )
                        })}

                        {isCustomized && (
                            <button
                                type="button"
                                className="act-safety__reset"
                                onClick={() => updateActSafety(actId, undefined)}
                            >
                                Reset to defaults
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
