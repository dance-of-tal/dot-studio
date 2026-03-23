import { lazy, Suspense, useMemo, useState } from 'react';

import { FileText, Eye, Save, Upload, X } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { useQueryClient } from '@tanstack/react-query';
import MarkdownRenderer from '../../components/shared/MarkdownRenderer';
import { useStudioStore } from '../../store';
import { api } from '../../api';
import { formatStudioApiErrorMessage } from '../../lib/api-errors';
import type { MarkdownEditorNode } from '../../types';

import { queryKeys, useDotAuthUser } from '../../hooks/queries';
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame';

import './MarkdownEditorFrame.css';

const DanceBundleEditorFrame = lazy(() => import('./DanceBundleEditorFrame'));


function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const [draft, setDraft] = useState('');

    const commitDraft = () => {
        const trimmed = draft.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed]);
        }
        setDraft('');
    };

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === ',' || event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
        } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
            removeTag(tags.length - 1);
        }
    };

    return (
        <div className="markdown-editor-frame__field">
            <span className="markdown-editor-frame__field-label">Tags</span>
            <div className="tags-input nodrag nowheel">
                {tags.map((tag, index) => (
                    <span key={`${tag}-${index}`} className="tags-input__chip">
                        {tag}
                        <button
                            type="button"
                            className="tags-input__remove"
                            onClick={() => removeTag(index)}
                            aria-label={`Remove ${tag}`}
                        >
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
    );
}

function nameToSlug(name: string) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'untitled';
}

function equalStringArray(left: string[] = [], right: string[] = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

type MarkdownEditorFrameData = Pick<MarkdownEditorNode, 'draftId' | 'kind' | 'baseline' | 'attachTarget' | 'width' | 'height'> & {
    workingDir: string
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function MarkdownEditorFrame(props: NodeProps<any>) {
    const { id, data, selected } = props as { id: string; data: MarkdownEditorFrameData; selected?: boolean };

    // Dance kind → delegate to bundle editor
    if (data.kind === 'dance') {
        return (
            <Suspense fallback={null}>
                <DanceBundleEditorFrame id={id} data={data} selected={selected} type="markdownEditor" />
            </Suspense>
        );
    }

    // Tal kind (and any other) → original markdown editor
    return <TalMarkdownEditor id={id} data={data} selected={selected} />;
}

function TalMarkdownEditor({ id, data, selected }: { id: string; data: MarkdownEditorFrameData; selected?: boolean }) {
    const drafts = useStudioStore((state) => state.drafts);
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef);
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef);
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef);
    const upsertDraft = useStudioStore((state) => state.upsertDraft);
    const updateMarkdownEditorBaseline = useStudioStore((state) => state.updateMarkdownEditorBaseline);
    const removeMarkdownEditor = useStudioStore((state) => state.removeMarkdownEditor);
    const { data: authUser } = useDotAuthUser();
    const queryClient = useQueryClient();

    const draft = drafts[data.draftId];
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null);
    const [action, setAction] = useState<null | 'draft' | 'local' | 'publish'>(null);

    const stopCanvasEvent = (event: React.SyntheticEvent) => {
        event.stopPropagation();
    };

    const baseline = data.baseline || null;
    const currentName = typeof draft?.name === 'string' ? draft.name : '';
    const currentSlug = typeof draft?.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(currentName);
    const currentDescription = typeof draft?.description === 'string' ? draft.description : '';
    const currentTags = useMemo(() => (Array.isArray(draft?.tags) ? draft.tags : []), [draft?.tags]);
    const currentContent = typeof draft?.content === 'string' ? draft.content : '';

    const dirty = useMemo(() => {
        if (!baseline) {
            return true;
        }
        return baseline.name !== currentName
            || (baseline.slug || '') !== currentSlug
            || (baseline.description || '') !== currentDescription
            || !equalStringArray(baseline.tags || [], currentTags)
            || baseline.content !== currentContent;
    }, [baseline, currentContent, currentDescription, currentName, currentSlug, currentTags]);

    const applyAttachTarget = (nextRef: { kind: 'draft' | 'registry'; draftId?: string; urn?: string }) => {
        const attachTarget = data.attachTarget;
        if (!attachTarget?.performerId) {
            return;
        }

        if (attachTarget.mode === 'tal') {
            setPerformerTalRef(attachTarget.performerId, nextRef.kind === 'draft'
                ? { kind: 'draft', draftId: nextRef.draftId! }
                : { kind: 'registry', urn: nextRef.urn! });
            return;
        }

        if (attachTarget.mode === 'dance-new' && !attachTarget.targetRef) {
            addPerformerDanceRef(attachTarget.performerId, nextRef.kind === 'draft'
                ? { kind: 'draft', draftId: nextRef.draftId! }
                : { kind: 'registry', urn: nextRef.urn! });
            return;
        }

        if (attachTarget.targetRef) {
            replacePerformerDanceRef(
                attachTarget.performerId,
                attachTarget.targetRef,
                nextRef.kind === 'draft'
                    ? { kind: 'draft', draftId: nextRef.draftId! }
                    : { kind: 'registry', urn: nextRef.urn! },
            );
        }
    };

    const persistBaseline = (derivedFrom?: string | null) => {
        updateMarkdownEditorBaseline(id, {
            name: currentName,
            slug: currentSlug,
            description: currentDescription,
            tags: currentTags,
            content: currentContent,
        });

        upsertDraft({
            id: data.draftId,
            kind: data.kind,
            name: currentName,
            slug: currentSlug,
            description: currentDescription,
            tags: currentTags,
            content: currentContent,
            derivedFrom: derivedFrom || draft?.derivedFrom || undefined,
            updatedAt: Date.now(),
        });
    };

    const invalidateAssets = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(data.workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(data.workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(data.workingDir, data.kind) }),
        ]);
    };

    const handleSaveDraft = () => {
        applyAttachTarget({ kind: 'draft', draftId: data.draftId });
        persistBaseline(draft?.derivedFrom || null);
        setStatus({ tone: 'success', message: 'Saved stage-local draft.' });
    };

    const handleSaveLocal = async () => {
        try {
            setAction('local');
            setStatus(null);
            const payload = {
                description: currentDescription.trim() || currentName.trim() || data.kind,
                tags: currentTags,
                content: currentContent,
            };
            const result = await api.dot.saveLocalAsset(data.kind, currentSlug.trim(), payload, authUser?.username || undefined);
            applyAttachTarget({ kind: 'registry', urn: result.urn });
            persistBaseline(result.urn);
            await invalidateAssets();
            setStatus({
                tone: 'success',
                message: result.existed
                    ? `Updated local ${data.kind} asset at ${result.urn}.`
                    : `Saved local ${data.kind} asset at ${result.urn}.`,
            });
        } catch (error: unknown) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) });
        } finally {
            setAction(null);
        }
    };

    const handlePublish = async () => {
        try {
            setAction('publish');
            setStatus(null);
            const payload = {
                description: currentDescription.trim() || currentName.trim() || data.kind,
                tags: currentTags,
                content: currentContent,
            };
            const result = await api.dot.publishAsset(data.kind, currentSlug.trim(), payload, payload.tags, true);
            applyAttachTarget({ kind: 'registry', urn: result.urn });
            persistBaseline(result.urn);
            await invalidateAssets();
            setStatus({
                tone: 'success',
                message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
            });
        } catch (error: unknown) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) });
        } finally {
            setAction(null);
        }
    };

    if (!draft) {
        return (
            <div className="markdown-editor-frame markdown-editor-frame--missing">
                <div className="markdown-editor-frame__header">
                    <span>Missing draft</span>
                    <button className="icon-btn" onClick={() => removeMarkdownEditor(id)} title="Close editor">
                        <X size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <CanvasWindowFrame
            className={`markdown-editor-frame`}
            width={Number(data.width || 560)}
            height={Number(data.height || 380)}
            transformActive={!!data.transformActive}
            onActivateTransform={data.onActivateTransform as (() => void) | undefined}
            onDeactivateTransform={data.onDeactivateTransform as (() => void) | undefined}
            selected={!!selected}
            minWidth={420}
            minHeight={280}
            headerStart={(
                <div className="markdown-editor-frame__title">
                    <FileText size={13} />
                    <span>{data.kind === 'tal' ? 'Tal Editor' : 'Dance Editor'}</span>
                    {dirty ? <span className="markdown-editor-frame__dirty">Unsaved</span> : null}
                </div>
            )}
            headerEnd={(
                <div className="markdown-editor-frame__actions">
                    <button className="icon-btn" onClick={handleSaveDraft} title="Save draft">
                        <Save size={12} />
                    </button>
                    <button className="icon-btn" onClick={handleSaveLocal} title="Save local asset" disabled={!dirty || !currentName.trim()}>
                        <Eye size={12} />
                    </button>
                    <button className="icon-btn" onClick={handlePublish} title="Publish asset" disabled={!dirty || !currentName.trim()}>
                        <Upload size={12} />
                    </button>
                    <button className="icon-btn" onClick={() => removeMarkdownEditor(id)} title="Close editor">
                        <X size={12} />
                    </button>
                </div>
            )}
        >

            <div className="markdown-editor-frame__meta nodrag nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__meta-row">
                    <label className="markdown-editor-frame__field">
                        <span className="markdown-editor-frame__field-label">Name</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={currentName}
                            onChange={(event) => upsertDraft({ ...draft, name: event.target.value, updatedAt: Date.now() })}
                            placeholder="Enter asset name"
                        />
                    </label>
                    <TagsInput
                        tags={currentTags}
                        onChange={(tags) => upsertDraft({ ...draft, tags, updatedAt: Date.now() })}
                    />
                </div>
                <label className="markdown-editor-frame__field">
                    <span className="markdown-editor-frame__field-label">Description</span>
                    <input
                        className="text-input nodrag nowheel"
                        value={currentDescription}
                        onChange={(event) => upsertDraft({ ...draft, description: event.target.value, updatedAt: Date.now() })}
                        placeholder="What this asset does"
                    />
                </label>
            </div>

            <div className="markdown-editor-frame__body" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__editor-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Editor</span>
                    <textarea
                        className="markdown-editor-frame__textarea nodrag nowheel"
                        value={currentContent}
                        onChange={(event) => upsertDraft({ ...draft, content: event.target.value, updatedAt: Date.now() })}
                        spellCheck={false}
                        placeholder={data.kind === 'tal'
                            ? 'Write the agent persona, global rules, workflows, and core instructions here using Markdown…'
                            : 'Write an optional skill or knowledge the agent can use, including when to apply it and how…'}
                    />
                </div>
                <div className="markdown-editor-frame__preview-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Preview</span>
                    <div className="markdown-editor-frame__preview nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                        {currentContent
                            ? <MarkdownRenderer content={currentContent} />
                            : <span className="markdown-editor-frame__preview-empty">Preview will appear here as you type…</span>}
                    </div>
                </div>
            </div>

            {status ? (
                <div className={`markdown-editor-frame__status markdown-editor-frame__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}

            {action ? (
                <div className="markdown-editor-frame__status">
                    {action === 'draft' ? 'Saving draft…' : action === 'local' ? 'Saving local asset…' : 'Publishing…'}
                </div>
            ) : null}
        </CanvasWindowFrame>
    );
}
