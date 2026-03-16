/**
 * EdgeEditPopover — Floating popover for editing Act relation (edge) attributes.
 *
 * Appears when an edge is clicked in Act edit focus mode.
 * Allows editing: name, description, invocation, await, sessionPolicy, maxCalls, timeout.
 */
import { useState, useEffect, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import type { ActRelation } from '../../types'
import './EdgeEditPopover.css'

interface EdgeEditPopoverProps {
    actId: string
    relationId: string
    position: { x: number; y: number }
    onClose: () => void
}

export default function EdgeEditPopover({ actId, relationId, position, onClose }: EdgeEditPopoverProps) {
    const { acts, updateRelation, removeRelationFromAct } = useStudioStore()
    const popoverRef = useRef<HTMLDivElement>(null)

    const act = acts.find((a) => a.id === actId)
    const relation = act?.relations.find((r) => r.id === relationId)

    const [form, setForm] = useState<Partial<ActRelation>>({})

    useEffect(() => {
        if (relation) {
            setForm({
                name: relation.name,
                description: relation.description,
                invocation: relation.invocation,
                await: relation.await,
                sessionPolicy: relation.sessionPolicy,
                maxCalls: relation.maxCalls,
                timeout: relation.timeout,
            })
        }
    }, [relation])

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    if (!relation || !act) return null

    const fromPerf = act.performers[relation.from]
    const toPerf = act.performers[relation.to]

    const update = (field: string, value: any) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        updateRelation(actId, relationId, { [field]: value })
    }

    const handleDelete = () => {
        removeRelationFromAct(actId, relationId)
        onClose()
    }

    return (
        <div
            ref={popoverRef}
            className="edge-edit-popover"
            style={{ left: position.x, top: position.y }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="edge-edit-popover__header">
                <span className="edge-edit-popover__title">
                    {fromPerf?.name || '?'} → {toPerf?.name || '?'}
                </span>
                <button className="icon-btn" onClick={onClose} title="Close">
                    <X size={12} />
                </button>
            </div>

            {/* Name */}
            <div className="edge-edit-popover__field">
                <label>Tool Name</label>
                <input
                    type="text"
                    value={form.name || ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="request_code_review"
                />
            </div>

            {/* Description */}
            <div className="edge-edit-popover__field">
                <label>Description</label>
                <textarea
                    value={form.description || ''}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="LLM이 보는 tool 설명"
                    rows={2}
                />
            </div>

            <div className="edge-edit-popover__row">
                {/* Invocation */}
                <div className="edge-edit-popover__field edge-edit-popover__field--half">
                    <label>Invocation</label>
                    <div className="edge-edit-popover__radio-group">
                        <label className={`edge-edit-popover__radio ${form.invocation === 'optional' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name={`invocation-${relationId}`}
                                checked={form.invocation === 'optional'}
                                onChange={() => update('invocation', 'optional')}
                            />
                            Optional
                        </label>
                        <label className={`edge-edit-popover__radio ${form.invocation === 'required' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name={`invocation-${relationId}`}
                                checked={form.invocation === 'required'}
                                onChange={() => update('invocation', 'required')}
                            />
                            Required
                        </label>
                    </div>
                </div>

                {/* Session Policy */}
                <div className="edge-edit-popover__field edge-edit-popover__field--half">
                    <label>Session</label>
                    <div className="edge-edit-popover__radio-group">
                        <label className={`edge-edit-popover__radio ${form.sessionPolicy === 'fresh' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name={`session-${relationId}`}
                                checked={form.sessionPolicy === 'fresh'}
                                onChange={() => update('sessionPolicy', 'fresh')}
                            />
                            Fresh
                        </label>
                        <label className={`edge-edit-popover__radio ${form.sessionPolicy === 'reuse' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name={`session-${relationId}`}
                                checked={form.sessionPolicy === 'reuse'}
                                onChange={() => update('sessionPolicy', 'reuse')}
                            />
                            Reuse
                        </label>
                    </div>
                </div>
            </div>

            <div className="edge-edit-popover__row">
                {/* Await */}
                <div className="edge-edit-popover__field edge-edit-popover__field--half">
                    <label>
                        <input
                            type="checkbox"
                            checked={form.await ?? true}
                            onChange={(e) => update('await', e.target.checked)}
                        />
                        Await Result
                    </label>
                </div>

                {/* MaxCalls */}
                <div className="edge-edit-popover__field edge-edit-popover__field--quarter">
                    <label>Max Calls</label>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.maxCalls ?? 10}
                        onChange={(e) => update('maxCalls', parseInt(e.target.value) || 10)}
                    />
                </div>

                {/* Timeout */}
                <div className="edge-edit-popover__field edge-edit-popover__field--quarter">
                    <label>Timeout (s)</label>
                    <input
                        type="number"
                        min={10}
                        max={3600}
                        value={form.timeout ?? 300}
                        onChange={(e) => update('timeout', parseInt(e.target.value) || 300)}
                    />
                </div>
            </div>

            {/* Delete */}
            <div className="edge-edit-popover__footer">
                <button className="edge-edit-popover__delete" onClick={handleDelete}>
                    <Trash2 size={12} /> Remove Edge
                </button>
            </div>
        </div>
    )
}
