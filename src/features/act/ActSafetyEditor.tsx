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
        defaultValue: 500,
        unit: 'events',
        min: 10,
        max: 5000,
        step: 10,
    },
    {
        key: 'maxMessagesPerPair',
        label: 'Max Messages per Pair',
        tooltip: 'Maximum messages between any two participants per thread. Prevents runaway conversations.',
        defaultValue: 50,
        unit: 'messages',
        min: 5,
        max: 500,
        step: 5,
    },
    {
        key: 'maxBoardUpdatesPerKey',
        label: 'Max Board Updates per Key',
        tooltip: 'Maximum updates to a single shared board key. Prevents infinite update loops.',
        defaultValue: 100,
        unit: 'updates',
        min: 5,
        max: 500,
        step: 5,
    },
    {
        key: 'quietWindowMs',
        label: 'Idle Quiet Window',
        tooltip: 'Seconds of inactivity before the runtime considers participants idle.',
        defaultValue: 60,
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
        defaultValue: 5,
        unit: 'alternations',
        min: 2,
        max: 50,
        step: 1,
    },
    {
        key: 'threadTimeoutMs',
        label: 'Thread Timeout',
        tooltip: 'Maximum thread lifetime in minutes. The thread is interrupted after this duration.',
        defaultValue: 30,
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

    if (!act) return null

    const safety = act.safety || {}

    const handleChange = useCallback((key: keyof SafetyFields, value: number, field: SafetyField) => {
        const clamped = Math.max(field.min, Math.min(field.max, value))
        const stored = field.displayDivisor ? clamped * field.displayDivisor : clamped
        const next = { ...safety, [key]: stored }
        // Remove fields that equal the default (keep payload lean)
        const defaultStored = field.displayDivisor ? field.defaultValue * field.displayDivisor : field.defaultValue
        if (stored === defaultStored) {
            delete next[key]
        }
        const hasValues = Object.keys(next).length > 0
        updateActSafety(actId, hasValues ? next : undefined)
    }, [safety, actId, updateActSafety])

    const getDisplayValue = (field: SafetyField): number => {
        const raw = safety[field.key]
        if (raw == null) return field.defaultValue
        return field.displayDivisor ? Math.round(raw / field.displayDivisor) : raw
    }

    const isCustomized = Object.keys(safety).length > 0

    return (
        <div className="act-panel__section">
            <label
                className="act-panel__label"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
            >
                <Shield size={11} />
                Safety
                {isCustomized && <span style={{ opacity: 0.5, fontSize: '0.85em' }}>(customized)</span>}
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </label>

            {expanded && (
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
                                        className="act-panel__input act-panel__input--number"
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
                            className="act-safety__reset"
                            onClick={() => updateActSafety(actId, undefined)}
                        >
                            Reset to defaults
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
