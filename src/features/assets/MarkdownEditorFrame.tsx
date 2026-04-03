import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileText, Save, Upload, X } from 'lucide-react'
import type { Node, NodeProps } from '@xyflow/react'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import type { MarkdownEditorNode } from '../../types'
import { equalStringArray, markdownEditorModeConfig, nameToSlug } from './markdown-authoring'
import DanceExportModal from './DanceExportModal'

import './MarkdownEditorFrame.css'

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const [draft, setDraft] = useState('')

    const commitDraft = () => {
        const trimmed = draft.trim()
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed])
        }
        setDraft('')
    }

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index))
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === ',' || event.key === 'Enter') {
            event.preventDefault()
            commitDraft()
        } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
            removeTag(tags.length - 1)
        }
    }

    return (
        <div className="markdown-editor-frame__field">
            <span className="markdown-editor-frame__field-label">Tags</span>
            <div className="tags-input nodrag nowheel">
                {tags.map((tag, index) => (
                    <span key={`${tag}-${index}`} className="tags-input__chip">
                        {tag}
                        <button type="button" className="tags-input__remove" onClick={() => removeTag(index)} aria-label={`Remove ${tag}`}>
                            ×
                        </button>
                    </span>
                ))}
                <input
                    className="tags-input__field nodrag nowheel"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commitDraft}
                    placeholder={tags.length === 0 ? 'Type and press comma' : ''}
                />
            </div>
        </div>
    )
}

type MarkdownEditorFrameData = Pick<MarkdownEditorNode, 'draftId' | 'kind' | 'baseline' | 'attachTarget' | 'width' | 'height'> & {
    workingDir: string
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

type MarkdownAssetEditorProps = {
    title: string
    dirty: boolean
    saveLabel: string
    showOpenButton: boolean
    showExportButton: boolean
    name: string
    description: string
    tags: string[]
    content: string
    previewContent: string
    helpText: string
    placeholder: string
    saveState: 'unsaved' | 'saved'
    exportDisabled?: boolean
    exportTitle?: string
    status: null | { tone: 'success' | 'error'; message: string }
    busyLabel: string | null
    selected: boolean
    width: number
    height: number
    transformActive: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onTagsChange: (tags: string[]) => void
    onContentChange: (value: string) => void
    onSaveDraft: () => void
    onOpen?: () => void
    onExport?: () => void
    onClose: () => void
}

function MarkdownAssetEditor({
    title,
    dirty,
    saveLabel,
    showOpenButton,
    showExportButton,
    name,
    description,
    tags,
    content,
    previewContent,
    helpText,
    placeholder,
    saveState,
    exportDisabled = false,
    exportTitle,
    status,
    busyLabel,
    selected,
    width,
    height,
    transformActive,
    onActivateTransform,
    onDeactivateTransform,
    onNameChange,
    onDescriptionChange,
    onTagsChange,
    onContentChange,
    onSaveDraft,
    onOpen,
    onExport,
    onClose,
}: MarkdownAssetEditorProps) {
    const stopCanvasEvent = (event: React.SyntheticEvent) => {
        event.stopPropagation()
    }

    return (
        <CanvasWindowFrame
            className="markdown-editor-frame"
            width={width}
            height={height}
            transformActive={transformActive}
            onActivateTransform={onActivateTransform}
            onDeactivateTransform={onDeactivateTransform}
            selected={selected}
            minWidth={420}
            minHeight={300}
            headerStart={(
                <div className="markdown-editor-frame__title">
                    <FileText size={13} />
                    <span className="markdown-editor-frame__title-text">{title}</span>
                    <span className={`markdown-editor-frame__badge markdown-editor-frame__badge--${saveState}`}>
                        {saveState === 'saved' ? 'Saved Draft' : 'Unsaved Draft'}
                    </span>
                    {dirty ? <span className="markdown-editor-frame__dirty">Unsaved Changes</span> : null}
                </div>
            )}
            headerEnd={(
                <div className="markdown-editor-frame__actions">
                    <button className="btn btn--primary btn--sm markdown-editor-frame__action-btn markdown-editor-frame__action-btn--save" onClick={onSaveDraft} disabled={!name.trim()}>
                        <Save size={12} /> {saveLabel}
                    </button>
                    {showOpenButton ? (
                        <button
                            className="btn btn--sm markdown-editor-frame__action-btn"
                            onClick={onOpen}
                            disabled={saveState !== 'saved'}
                            title={saveState === 'saved' ? 'Open the saved bundle folder' : 'Save this draft to create the bundle folder first'}
                        >
                            <ExternalLink size={12} /> Open
                        </button>
                    ) : null}
                    {showExportButton ? (
                        <button
                            className="btn btn--sm markdown-editor-frame__action-btn markdown-editor-frame__action-btn--export"
                            onClick={onExport}
                            disabled={exportDisabled}
                            title={exportTitle}
                        >
                            <Upload size={12} /> Export
                        </button>
                    ) : null}
                    <button className="icon-btn markdown-editor-frame__close-btn" onClick={onClose} title="Close editor">
                        <X size={12} />
                    </button>
                </div>
            )}
        >
            <div className="markdown-editor-frame__help" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                {helpText}
            </div>

            <div className="markdown-editor-frame__meta nodrag nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__meta-row">
                    <label className="markdown-editor-frame__field">
                        <span className="markdown-editor-frame__field-label">Name</span>
                        <input className="text-input nodrag nowheel" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Enter asset name" />
                    </label>
                    <TagsInput tags={tags} onChange={onTagsChange} />
                </div>
                <label className="markdown-editor-frame__field">
                    <span className="markdown-editor-frame__field-label">Description</span>
                    <input className="text-input nodrag nowheel" value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="What this asset does" />
                </label>
            </div>

            <div className="markdown-editor-frame__body" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__editor-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Editor</span>
                    <textarea
                        className="markdown-editor-frame__textarea nodrag nowheel"
                        value={content}
                        onChange={(event) => onContentChange(event.target.value)}
                        spellCheck={false}
                        placeholder={placeholder}
                    />
                </div>
                <div className="markdown-editor-frame__preview-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Preview</span>
                    <div className="markdown-editor-frame__preview nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                        {previewContent
                            ? <MarkdownRenderer content={previewContent} />
                            : <span className="markdown-editor-frame__preview-empty">Your preview will appear here as you write.</span>}
                    </div>
                </div>
            </div>

            {status ? (
                <div className={`markdown-editor-frame__status markdown-editor-frame__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}

            {busyLabel ? (
                <div className="markdown-editor-frame__status">
                    {busyLabel}
                </div>
            ) : null}
        </CanvasWindowFrame>
    )
}

export default function MarkdownEditorFrame({ id, data, selected }: NodeProps<Node<MarkdownEditorFrameData, 'markdownEditor'>>) {

    const draft = useStudioStore((state) => state.drafts[data.draftId])
    const workingDir = useStudioStore((state) => state.workingDir)
    const upsertDraft = useStudioStore((state) => state.upsertDraft)
    const saveMarkdownDraft = useStudioStore((state) => state.saveMarkdownDraft)
    const removeMarkdownEditor = useStudioStore((state) => state.removeMarkdownEditor)
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef)
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef)
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef)

    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null)
    const [busyAction, setBusyAction] = useState<null | 'save'>(null)
    const [exportOpen, setExportOpen] = useState(false)
    const config = markdownEditorModeConfig(data.kind)
    const [editorState, setEditorState] = useState(() => ({
        name: typeof draft?.name === 'string' ? draft.name : '',
        slug: typeof draft?.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(typeof draft?.name === 'string' ? draft.name : ''),
        description: typeof draft?.description === 'string' ? draft.description : '',
        tags: Array.isArray(draft?.tags) ? draft.tags : [],
        content: typeof draft?.content === 'string' ? draft.content : '',
    }))

    useEffect(() => {
        const currentDraft = data.draftId ? useStudioStore.getState().drafts[data.draftId] : undefined
        setEditorState({
            name: typeof currentDraft?.name === 'string' ? currentDraft.name : '',
            slug: typeof currentDraft?.slug === 'string' && currentDraft.slug.trim() ? currentDraft.slug : nameToSlug(typeof currentDraft?.name === 'string' ? currentDraft.name : ''),
            description: typeof currentDraft?.description === 'string' ? currentDraft.description : '',
            tags: Array.isArray(currentDraft?.tags) ? currentDraft.tags : [],
            content: typeof currentDraft?.content === 'string' ? currentDraft.content : '',
        })
    }, [data.draftId, draft?.id])

    const currentName = editorState.name
    const currentSlug = editorState.slug
    const currentDescription = editorState.description
    const currentTags = editorState.tags
    const currentContent = editorState.content
    const saveState = draft?.saveState || 'unsaved'
    const baseline = data.baseline || null
    const deferredPreviewContent = useDeferredValue(currentContent)

    const dirty = useMemo(() => {
        if (!baseline) return true
        return baseline.name !== currentName
            || (baseline.slug || '') !== currentSlug
            || (baseline.description || '') !== currentDescription
            || !equalStringArray(baseline.tags || [], currentTags)
            || baseline.content !== currentContent
    }, [baseline, currentContent, currentDescription, currentName, currentSlug, currentTags])
    const exportDisabled = saveState !== 'saved' || dirty
    const exportTitle = saveState !== 'saved'
        ? 'Save this draft before exporting'
        : dirty
            ? 'Save your latest changes before exporting'
            : 'Export this saved Dance bundle'

    const applySavedDraftRef = (draftId: string) => {
        const attachTarget = data.attachTarget
        if (!attachTarget?.performerId) return
        const nextRef = { kind: 'draft' as const, draftId }
        if (attachTarget.mode === 'tal') {
            setPerformerTalRef(attachTarget.performerId, nextRef)
            return
        }
        if (attachTarget.mode === 'dance-new' && !attachTarget.targetRef) {
            addPerformerDanceRef(attachTarget.performerId, nextRef)
            return
        }
        if (attachTarget.targetRef) {
            replacePerformerDanceRef(attachTarget.performerId, attachTarget.targetRef, nextRef)
        }
    }

    const flushEditorStateToDraft = useCallback(() => {
        if (!draft) return
        upsertDraft({
            ...draft,
            name: currentName,
            slug: currentSlug,
            description: currentDescription,
            tags: currentTags,
            content: currentContent,
            updatedAt: Date.now(),
        })
    }, [draft, upsertDraft, currentName, currentSlug, currentDescription, currentTags, currentContent])

    useEffect(() => {
        if (!draft) return
        const draftName = typeof draft.name === 'string' ? draft.name : ''
        const draftSlug = typeof draft.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(draftName)
        const draftDescription = typeof draft.description === 'string' ? draft.description : ''
        const draftTags = Array.isArray(draft.tags) ? draft.tags : []
        const draftContent = typeof draft.content === 'string' ? draft.content : ''
        if (
            draftName === currentName
            && draftSlug === currentSlug
            && draftDescription === currentDescription
            && equalStringArray(draftTags, currentTags)
            && draftContent === currentContent
        ) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            flushEditorStateToDraft()
        }, 180)

        return () => window.clearTimeout(timeoutId)
    }, [draft, currentName, currentSlug, currentDescription, currentTags, currentContent, flushEditorStateToDraft])

    const handleSaveDraft = async () => {
        if (!draft) return
        try {
            setBusyAction('save')
            setStatus(null)
            flushEditorStateToDraft()
            const saved = await saveMarkdownDraft(id)
            applySavedDraftRef(saved.id)
            setStatus({
                tone: 'success',
                message: draft.saveState === 'saved'
                    ? 'Draft updated.'
                    : 'Draft saved.',
            })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const handleOpenDanceBundle = async () => {
        try {
            if (!draft || draft.kind !== 'dance' || draft.saveState !== 'saved') return
            await api.studio.openPath(`${workingDir}/.dance-of-tal/drafts/dance/${draft.id}`)
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        }
    }

    const handleCloseEditor = () => {
        flushEditorStateToDraft()
        removeMarkdownEditor(id)
    }

    if (!draft) {
        return (
            <div className="markdown-editor-frame markdown-editor-frame--missing">
                <div className="markdown-editor-frame__header">
                    <span>Draft not found</span>
                    <button className="icon-btn" onClick={() => removeMarkdownEditor(id)} title="Close editor">
                        <X size={12} />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <>
            <MarkdownAssetEditor
                title={config.title}
                dirty={dirty}
                saveLabel="Save Draft"
                showOpenButton={config.showOpenButton}
                showExportButton={config.showExportButton}
                name={currentName}
                description={currentDescription}
                tags={currentTags}
                content={currentContent}
                previewContent={deferredPreviewContent}
                helpText={config.helpText}
                placeholder={config.placeholder}
                saveState={saveState}
                exportDisabled={exportDisabled}
                exportTitle={exportTitle}
                status={status}
                busyLabel={busyAction === 'save' ? 'Saving draft…' : null}
                selected={!!selected}
                width={Number(data.width || 560)}
                height={Number(data.height || 380)}
                transformActive={!!data.transformActive}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                onNameChange={(value) => setEditorState((state) => ({ ...state, name: value, slug: nameToSlug(value) }))}
                onDescriptionChange={(value) => setEditorState((state) => ({ ...state, description: value }))}
                onTagsChange={(tags) => setEditorState((state) => ({ ...state, tags }))}
                onContentChange={(value) => setEditorState((state) => ({ ...state, content: value }))}
                onSaveDraft={() => { void handleSaveDraft() }}
                onOpen={data.kind === 'dance' ? () => { void handleOpenDanceBundle() } : undefined}
                onExport={data.kind === 'dance' ? () => {
                    setExportOpen(true)
                } : undefined}
                onClose={handleCloseEditor}
            />

            {data.kind === 'dance' ? (
                <DanceExportModal
                    open={exportOpen}
                    draft={draft}
                    onClose={() => setExportOpen(false)}
                />
            ) : null}
        </>
    )
}
