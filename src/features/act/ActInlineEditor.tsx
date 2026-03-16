/**
 * ActInlineEditor — Right-side panel for editing Tal/Dance markdown
 * content associated with the selected Act performer.
 *
 * In Act edit focus mode, this shows a simple markdown editor
 * for the selected performer's Tal and Dance assets.
 * Works with the draft system for inline editing.
 */
import { useState, useMemo, useEffect } from 'react'
import { FileText, Hexagon, Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { useStudioStore } from '../../store'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import './ActInlineEditor.css'

type EditorTab = { kind: 'tal' | 'dance'; label: string; draftId?: string; urn?: string; content: string }

export default function ActInlineEditor() {
    const {
        acts,
        editingActId,
        selectedActPerformerKey,
        drafts,
        upsertDraft,
        updateActPerformer,
    } = useStudioStore()

    const [activeTabIdx, setActiveTabIdx] = useState(0)
    const [showPreview, setShowPreview] = useState(false)

    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const performer = act && selectedActPerformerKey ? act.performers[selectedActPerformerKey] : null

    // Build tabs from performer's talRef and danceRefs
    const tabs: EditorTab[] = useMemo(() => {
        if (!performer) return []
        const result: EditorTab[] = []

        // Tal tab
        if (performer.talRef) {
            if (performer.talRef.kind === 'draft') {
                const draft = drafts[performer.talRef.draftId]
                result.push({
                    kind: 'tal',
                    label: draft?.name || 'Tal (draft)',
                    draftId: performer.talRef.draftId,
                    content: (draft?.content as string) || '',
                })
            } else {
                result.push({
                    kind: 'tal',
                    label: performer.talRef.urn.split('/').pop() || 'Tal',
                    urn: performer.talRef.urn,
                    content: '',  // Registry content needs API fetch
                })
            }
        }

        // Dance tabs
        performer.danceRefs.forEach((ref, i) => {
            if (ref.kind === 'draft') {
                const draft = drafts[ref.draftId]
                result.push({
                    kind: 'dance',
                    label: draft?.name || `Dance ${i + 1} (draft)`,
                    draftId: ref.draftId,
                    content: (draft?.content as string) || '',
                })
            } else {
                result.push({
                    kind: 'dance',
                    label: ref.urn.split('/').pop() || `Dance ${i + 1}`,
                    urn: ref.urn,
                    content: '',
                })
            }
        })

        return result
    }, [performer, drafts])

    // Reset active tab when performer changes
    useEffect(() => {
        setActiveTabIdx(0)
    }, [selectedActPerformerKey])

    if (!act || !performer || !selectedActPerformerKey || !editingActId) return null
    if (tabs.length === 0) {
        return (
            <div className="act-inline-editor" onClick={(e) => e.stopPropagation()}>
                <div className="act-inline-editor__empty">
                    <FileText size={24} className="act-inline-editor__empty-icon" />
                    <p>No Tal or Dance assets connected.</p>
                    <p className="act-inline-editor__empty-hint">
                        Drag assets from the Asset Library onto this performer, or use the inspector to add them.
                    </p>
                </div>
            </div>
        )
    }

    const activeTab = tabs[Math.min(activeTabIdx, tabs.length - 1)]
    const isEditable = !!activeTab?.draftId
    const content = activeTab?.content || ''

    const handleContentChange = (newContent: string) => {
        if (!activeTab?.draftId) return
        const draft = drafts[activeTab.draftId]
        if (draft) {
            upsertDraft({ ...draft, content: newContent, updatedAt: Date.now() })
        }
    }

    const handleCreateDraft = () => {
        // Create a new Tal draft for this performer
        const draftId = `act-tal-${editingActId}-${selectedActPerformerKey}-${Date.now()}`
        upsertDraft({
            id: draftId,
            kind: 'tal',
            name: `${performer.name} Tal`,
            slug: '',
            description: '',
            tags: [],
            content: `# ${performer.name}\n\nDescribe the performer's persona and instructions here.\n`,
            updatedAt: Date.now(),
        })
        updateActPerformer(editingActId, selectedActPerformerKey, {
            talRef: { kind: 'draft', draftId },
        })
    }

    const handleCreateDanceDraft = () => {
        const draftId = `act-dance-${editingActId}-${selectedActPerformerKey}-${Date.now()}`
        upsertDraft({
            id: draftId,
            kind: 'dance',
            name: `${performer.name} Dance ${performer.danceRefs.length + 1}`,
            slug: '',
            description: '',
            tags: [],
            content: `# Dance\n\nDefine the skill or workflow here.\n`,
            updatedAt: Date.now(),
        })
        updateActPerformer(editingActId, selectedActPerformerKey, {
            danceRefs: [...performer.danceRefs, { kind: 'draft', draftId }],
        })
    }

    return (
        <div className="act-inline-editor" onClick={(e) => e.stopPropagation()}>
            {/* Tab bar */}
            <div className="act-inline-editor__tabs">
                {tabs.map((tab, i) => (
                    <button
                        key={tab.draftId || tab.urn || i}
                        className={`act-inline-editor__tab ${i === activeTabIdx ? 'act-inline-editor__tab--active' : ''}`}
                        onClick={() => setActiveTabIdx(i)}
                    >
                        {tab.kind === 'tal' ? <Hexagon size={10} /> : <Zap size={10} />}
                        <span>{tab.label}</span>
                    </button>
                ))}
                <div className="act-inline-editor__tab-actions">
                    {!performer.talRef && (
                        <button className="act-inline-editor__add-btn" onClick={handleCreateDraft} title="Create Tal draft">
                            + Tal
                        </button>
                    )}
                    <button className="act-inline-editor__add-btn" onClick={handleCreateDanceDraft} title="Create Dance draft">
                        + Dance
                    </button>
                </div>
            </div>

            {/* Editor area */}
            <div className="act-inline-editor__body">
                {isEditable ? (
                    <>
                        <textarea
                            className="act-inline-editor__textarea"
                            value={content}
                            onChange={(e) => handleContentChange(e.target.value)}
                            spellCheck={false}
                            placeholder={activeTab.kind === 'tal'
                                ? 'Write the performer persona, rules, and instructions...'
                                : 'Write the skill or workflow...'}
                        />
                        <button
                            className="act-inline-editor__preview-toggle"
                            onClick={() => setShowPreview(!showPreview)}
                        >
                            {showPreview ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            Preview
                        </button>
                        {showPreview && (
                            <div className="act-inline-editor__preview">
                                {content
                                    ? <MarkdownRenderer content={content} />
                                    : <span className="act-inline-editor__preview-empty">Preview appears as you type...</span>}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="act-inline-editor__readonly">
                        <p>Registry asset: <code>{activeTab.urn}</code></p>
                        <p className="act-inline-editor__readonly-hint">
                            Registry assets are read-only. Create a draft copy to edit inline.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
