/**
 * ActPerformerInspector — Left-side inspector panel for Act edit focus mode.
 *
 * Shows when an act-performer node is selected on the canvas.
 * Allows editing performer config (name, model, tal, dance, mcp)
 * and viewing/editing Act relations connected to this performer.
 */
import { useState, useMemo } from 'react'
import { User, X, Cpu, Hexagon, Zap, ArrowRight, Trash2 } from 'lucide-react'
import { useStudioStore } from '../../store'
import ModelQuickPicker from '../performer/ModelQuickPicker'
import type { ModelConfig } from '../../types'
import './ActPerformerInspector.css'

export default function ActPerformerInspector() {
    const {
        acts,
        editingActId,
        selectedActPerformerKey,
        updateActPerformer,
        removePerformerFromAct,
        removeRelationFromAct,
        updateRelation,
        drafts,
    } = useStudioStore()

    const [showModelPicker, setShowModelPicker] = useState(false)
    const [editingName, setEditingName] = useState(false)
    const [nameValue, setNameValue] = useState('')

    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const performer = act && selectedActPerformerKey ? act.performers[selectedActPerformerKey] : null

    // Relations involving this performer
    const relatedRelations = useMemo(() => {
        if (!act || !selectedActPerformerKey) return []
        return act.relations.filter(
            (r) => r.from === selectedActPerformerKey || r.to === selectedActPerformerKey,
        )
    }, [act, selectedActPerformerKey])

    if (!act || !performer || !selectedActPerformerKey || !editingActId) return null

    const modelLabel = performer.model
        ? `${performer.model.provider}/${performer.model.modelId}`
        : null
    const talLabel = performer.talRef
        ? performer.talRef.kind === 'draft'
            ? drafts[performer.talRef.draftId]?.name || 'Draft Tal'
            : performer.talRef.urn.split('/').pop() || performer.talRef.urn
        : null

    const handleNameSubmit = () => {
        if (nameValue.trim() && nameValue !== performer.name) {
            updateActPerformer(editingActId, selectedActPerformerKey, { name: nameValue.trim() })
        }
        setEditingName(false)
    }

    const handleModelSelect = (model: ModelConfig) => {
        updateActPerformer(editingActId, selectedActPerformerKey, { model })
        setShowModelPicker(false)
    }

    const getPerformerName = (key: string) => act.performers[key]?.name || key

    return (
        <div className="act-inspector" onClick={(e) => e.stopPropagation()}>
            <div className="act-inspector__header">
                <User size={12} className="act-inspector__header-icon" />
                {editingName ? (
                    <input
                        className="act-inspector__name-input"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onBlur={handleNameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNameSubmit()
                            if (e.key === 'Escape') setEditingName(false)
                        }}
                        autoFocus
                    />
                ) : (
                    <span
                        className="act-inspector__name"
                        onClick={() => {
                            setNameValue(performer.name)
                            setEditingName(true)
                        }}
                        title="Click to rename"
                    >
                        {performer.name}
                    </span>
                )}
                <button
                    className="icon-btn act-inspector__remove"
                    title="Remove from Act"
                    onClick={() => removePerformerFromAct(editingActId, selectedActPerformerKey)}
                >
                    <Trash2 size={11} />
                </button>
            </div>

            {/* Model */}
            <div className="act-inspector__section">
                <div className="act-inspector__section-title">
                    <Cpu size={11} /> Model
                </div>
                <button
                    className="act-inspector__config-btn"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                >
                    {modelLabel || 'No model selected'}
                </button>
                <ModelQuickPicker
                    open={showModelPicker}
                    currentModel={performer.model}
                    onSelect={handleModelSelect}
                    onClose={() => setShowModelPicker(false)}
                    title="Choose a performer model"
                />
            </div>

            {/* Tal */}
            <div className="act-inspector__section">
                <div className="act-inspector__section-title">
                    <Hexagon size={11} /> Tal
                </div>
                <div className="act-inspector__config-row">
                    <span className="act-inspector__config-value">
                        {talLabel || 'No Tal connected'}
                    </span>
                    {performer.talRef && (
                        <button
                            className="icon-btn"
                            title="Remove Tal"
                            onClick={() => updateActPerformer(editingActId, selectedActPerformerKey, { talRef: null })}
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>
            </div>

            {/* Dances */}
            <div className="act-inspector__section">
                <div className="act-inspector__section-title">
                    <Zap size={11} /> Dances ({performer.danceRefs.length})
                </div>
                {performer.danceRefs.length > 0 ? (
                    <div className="act-inspector__list">
                        {performer.danceRefs.map((ref, i) => {
                            const label = ref.kind === 'draft'
                                ? drafts[ref.draftId]?.name || 'Draft'
                                : ref.urn.split('/').pop() || ref.urn
                            return (
                                <div key={i} className="act-inspector__list-item">
                                    <span>{label}</span>
                                    <button
                                        className="icon-btn"
                                        onClick={() => {
                                            const newRefs = [...performer.danceRefs]
                                            newRefs.splice(i, 1)
                                            updateActPerformer(editingActId, selectedActPerformerKey, { danceRefs: newRefs })
                                        }}
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <span className="act-inspector__empty">No dances</span>
                )}
            </div>

            {/* Relations */}
            <div className="act-inspector__section">
                <div className="act-inspector__section-title">
                    <ArrowRight size={11} /> Relations ({relatedRelations.length})
                </div>
                {relatedRelations.length > 0 ? (
                    <div className="act-inspector__list">
                        {relatedRelations.map((rel) => {
                            const isFrom = rel.from === selectedActPerformerKey
                            const otherKey = isFrom ? rel.to : rel.from
                            const direction = isFrom ? '→' : '←'
                            return (
                                <div key={rel.id} className="act-inspector__relation-item">
                                    <div className="act-inspector__relation-header">
                                        <span className="act-inspector__relation-direction">
                                            {direction} {getPerformerName(otherKey)}
                                        </span>
                                        <button
                                            className="icon-btn"
                                            title="Remove relation"
                                            onClick={() => removeRelationFromAct(editingActId, rel.id)}
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <input
                                        className="act-inspector__relation-desc"
                                        placeholder="Description (optional)"
                                        value={rel.description}
                                        onChange={(e) => updateRelation(editingActId, rel.id, { description: e.target.value })}
                                    />
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <span className="act-inspector__empty">No relations. Drag between performer handles to connect.</span>
                )}
            </div>
        </div>
    )
}
