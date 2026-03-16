import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Upload, Save, ChevronLeft, FileText, Wand2, Zap } from 'lucide-react';
import { useStudioStore } from '../../store';
import { api } from '../../api';
import { formatStudioApiErrorMessage } from '../../lib/api-errors';
import { buildPerformerAssetPayload, buildActAssetPayload, slugifyAssetName, unresolvedDeclaredMcpServerNames } from '../../lib/performers';
import { queryKeys } from '../../hooks/queries';
import { useDotLogin } from '../../hooks/useDotLogin';
import { DOT_TOS_URL } from '../../lib/dot-terms';
import './PublishModal.css';
import {
    parseTags,
    buildPickerItems,
    buildPerformerPreflight,
    buildMarkdownAssetPayload,
    getActPublishBlockReasons,
    PickerSection,
} from './publish-modal-utils';
import type { PickerItem } from './publish-modal-utils';


// ── Main Component ──────────────────────────────────────


export default function PublishModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const workingDir = useStudioStore((state) => state.workingDir);
    const performers = useStudioStore((state) => state.performers);
    const drafts = useStudioStore((state) => state.drafts);
    const markdownEditors = useStudioStore((state) => state.markdownEditors);
    const acts = useStudioStore((state) => state.acts);

    const updatePerformerAuthoringMeta = useStudioStore((state) => state.updatePerformerAuthoringMeta);
    const updateMarkdownEditorBaseline = useStudioStore((state) => state.updateMarkdownEditorBaseline);
    const upsertDraft = useStudioStore((state) => state.upsertDraft);
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef);
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef);
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef);
    const queryClient = useQueryClient();
    const { authUser, startLogin, isAuthenticating } = useDotLogin();

    // ── Step state ──────────────────────────────────────
    const [step, setStep] = useState<'picker' | 'form'>('picker');
    const [pickerSelection, setPickerSelection] = useState<PickerItem | null>(null);

    // ── Resolve selection to concrete store objects ──────
    const performer = pickerSelection?.kind === 'performer'
        ? performers.find((p) => p.id === pickerSelection.performerId) || null
        : null;
    const markdownEditor = pickerSelection?.source === 'draft'
        ? markdownEditors.find((e) => e.id === pickerSelection.editorId) || null
        : null;
    const draft = markdownEditor ? drafts[markdownEditor.draftId] || null : null;

    // For local-saved tal/dance, we create a virtual draft-like target
    const isLocalAsset = pickerSelection?.source === 'local';

    const selectedAct = pickerSelection?.kind === 'act'
        ? acts.find((a) => a.id === (pickerSelection as any).actId) || null
        : null;

    const target = performer
        ? { kind: 'performer' as const, id: performer.id, name: performer.name }
        : selectedAct
            ? { kind: 'act' as const, id: selectedAct.id, name: selectedAct.name }
            : markdownEditor && draft
                ? { kind: markdownEditor.kind, id: markdownEditor.id, name: draft.name || `${markdownEditor.kind} draft` }
                : isLocalAsset && pickerSelection
                    ? { kind: pickerSelection.kind, id: pickerSelection.urn, name: pickerSelection.name }
                    : null;

    // ── Publish form state ──────────────────────────────
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null);
    const [action, setAction] = useState<null | 'save-local' | 'publish'>(null);
    const [projectMcpConfig, setProjectMcpConfig] = useState<Record<string, unknown>>({});

    // ── Build publishable item list ─────────────────────
    const pickerItems = useMemo(() => {
        return buildPickerItems({
            installedTals: [],
            installedDances: [],
            markdownEditors,
            drafts,
            performers,
            acts,
        });
    }, [markdownEditors, drafts, performers, acts]);

    // ── Reset on open/close ─────────────────────────────
    useEffect(() => {
        if (open) {
            setStep('picker');
            setPickerSelection(null);
            setStatus(null);
        }
    }, [open]);

    // ── Populate form fields when selection changes ─────
    useEffect(() => {
        if (step !== 'form' || !pickerSelection) return;
        setStatus(null);

        if (performer) {
            setSlug(performer.meta?.authoring?.slug || slugifyAssetName(performer.name));
            setDescription(performer.meta?.authoring?.description || performer.name);
            setTagsText((performer.meta?.authoring?.tags || []).join(', '));
            return;
        }
        if (draft) {
            setSlug(draft.slug || slugifyAssetName(draft.name));
            setDescription(draft.description || draft.name);
            setTagsText((draft.tags || []).join(', '));
            return;
        }
        if (isLocalAsset && pickerSelection && pickerSelection.source === 'local') {
            setSlug(pickerSelection.slug);
            setDescription(pickerSelection.name);
            setTagsText('');
        }
    }, [step, pickerSelection, performer, draft, isLocalAsset]);

    // ── Fetch project MCP config ────────────────────────
    useEffect(() => {
        if (!open) return;
        api.config.getProject()
            .then((result) => {
                const config = result?.config && typeof result.config === 'object' ? result.config : {};
                const mcp = config && typeof config.mcp === 'object' && config.mcp ? config.mcp : {};
                setProjectMcpConfig(mcp as Record<string, unknown>);
            })
            .catch(() => setProjectMcpConfig({}));
    }, [open]);

    // ── Preflight checks ────────────────────────────────
    const performerPreflight = useMemo(() => {
        return buildPerformerPreflight(performer);
    }, [performer]);


    const markdownDirty = useMemo(() => {
        if (!markdownEditor || !draft) return false;
        const baseline = markdownEditor.baseline;
        if (!baseline) return true;
        return baseline.name !== draft.name
            || (baseline.slug || '') !== (draft.slug || '')
            || (baseline.description || '') !== (draft.description || '')
            || JSON.stringify(baseline.tags || []) !== JSON.stringify(draft.tags || [])
            || baseline.content !== draft.content;
    }, [draft, markdownEditor]);

    const performerHasBlockingDependencies = useMemo(
        () => performerPreflight.some((entry: any) => entry.status !== 'ready'),
        [performerPreflight],
    );
    const performerHasUnresolvedMcpPlaceholders = useMemo(
        () => performer ? unresolvedDeclaredMcpServerNames(performer).length > 0 : false,
        [performer],
    );

    const publishBlockedReason = useMemo(() => {
        if (performer && performerHasBlockingDependencies) {
            return 'Save Tal and Dance dependencies as local or published assets before exporting this performer.';
        }
        if (performer && performerHasUnresolvedMcpPlaceholders) {
            return 'Map imported MCP placeholders to project MCP servers before publishing.';
        }
        if (selectedAct) {
            const actBlockReasons = getActPublishBlockReasons(selectedAct);
            if (actBlockReasons.length > 0) {
                return actBlockReasons.join(' ');
            }
        }
        return null;
    }, [performer, performerHasBlockingDependencies, performerHasUnresolvedMcpPlaceholders, selectedAct]);

    const canSaveOrPublish = !!target
        && !!slug.trim()
        && (!markdownEditor || markdownDirty)
        && !publishBlockedReason
        && !!authUser?.authenticated;

    const invalidateKind = async (kind: 'tal' | 'dance' | 'performer' | 'act') => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ]);
    };

    const syncMarkdownDraftPublishState = (
        resultUrn: string,
        payload: ReturnType<typeof buildMarkdownAssetPayload>,
    ) => {
        if (!markdownEditor || !draft) {
            return;
        }

        upsertDraft({
            ...draft,
            slug: payload.slug,
            description: payload.description,
            tags: payload.tags,
            derivedFrom: resultUrn,
            updatedAt: Date.now(),
        });
        updateMarkdownEditorBaseline(markdownEditor.id, payload);

        if (!markdownEditor.attachTarget?.performerId) {
            return;
        }

        const nextRef = { kind: 'registry' as const, urn: resultUrn };
        if (markdownEditor.attachTarget.mode === 'tal') {
            setPerformerTalRef(markdownEditor.attachTarget.performerId, nextRef);
        } else if (markdownEditor.attachTarget.mode === 'dance-new' && !markdownEditor.attachTarget.targetRef) {
            addPerformerDanceRef(markdownEditor.attachTarget.performerId, nextRef);
        } else if (markdownEditor.attachTarget.targetRef) {
            replacePerformerDanceRef(markdownEditor.attachTarget.performerId, markdownEditor.attachTarget.targetRef, nextRef);
        }
    };

    // ── Handlers ────────────────────────────────────────

    const handleSaveLocal = async () => {
        if (!target) return;
        try {
            setAction('save-local');
            setStatus(null);
            const tags = parseTags(tagsText);

            if (target.kind === 'performer' && performer) {
                updatePerformerAuthoringMeta(performer.id, { slug, description, tags });
                const payload = buildPerformerAssetPayload(performer, {
                    name: performer.name,
                    description,
                    tags,
                    projectMcpConfig,
                });
                const result = await api.dot.saveLocalAsset('performer', slug, payload, authUser?.username || undefined);
                await invalidateKind('performer');
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local performer asset at ${result.urn}.` : `Saved local performer asset at ${result.urn}.`,
                });
                return;
            }

            if (target.kind === 'act' && selectedAct) {
                const payload = buildActAssetPayload(selectedAct, { description, tags });
                const result = await api.dot.saveLocalAsset('act', slug, payload, authUser?.username || undefined);
                await invalidateKind('act');
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local act asset at ${result.urn}.` : `Saved local act asset at ${result.urn}.`,
                });
                return;
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && markdownEditor && draft) {
                const payload = buildMarkdownAssetPayload(markdownEditor, draft, slug, description, tags);
                const result = await api.dot.saveLocalAsset(markdownEditor.kind, payload.slug, payload, authUser?.username || undefined);
                syncMarkdownDraftPublishState(result.urn, payload);
                await invalidateKind(markdownEditor.kind);
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local ${markdownEditor.kind} asset at ${result.urn}.` : `Saved local ${markdownEditor.kind} asset at ${result.urn}.`,
                });
                return;
            }

            // Local-saved tal/dance (no editor open)
            if ((target.kind === 'tal' || target.kind === 'dance') && isLocalAsset) {
                setStatus({ tone: 'success', message: `${target.kind}/${target.id} is already saved locally.` });
            }
        } catch (error: any) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) });
        } finally {
            setAction(null);
        }
    };

    const handlePublish = async () => {
        if (!target) return;
        try {
            setAction('publish');
            setStatus(null);
            const tags = parseTags(tagsText);

            if (target.kind === 'performer' && performer) {
                updatePerformerAuthoringMeta(performer.id, { slug, description, tags });
                const payload = buildPerformerAssetPayload(performer, {
                    name: performer.name,
                    description,
                    tags,
                    projectMcpConfig,
                });
                const result = await api.dot.publishAsset('performer', slug, payload, tags, true);
                await invalidateKind('performer');
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                });
                return;
            }

            if (target.kind === 'act' && selectedAct) {
                const payload = buildActAssetPayload(selectedAct, { description, tags });
                const result = await api.dot.publishAsset('act', slug, payload, tags, true);
                await invalidateKind('act');
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                });
                return;
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && markdownEditor && draft) {
                const payload = buildMarkdownAssetPayload(markdownEditor, draft, slug, description, tags);
                const result = await api.dot.publishAsset(markdownEditor.kind, payload.slug, payload, tags, true);
                syncMarkdownDraftPublishState(result.urn, payload);
                await invalidateKind(markdownEditor.kind);
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                });
                return;
            }

            // Local-saved tal/dance (no editor open) — publish from saved file
            if ((target.kind === 'tal' || target.kind === 'dance') && isLocalAsset) {
                const result = await api.dot.publishAsset(target.kind, slug, undefined, tags, true);
                await invalidateKind(target.kind);
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                });
            }
        } catch (error: any) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) });
        } finally {
            setAction(null);
        }
    };

    // ── Picker handlers ─────────────────────────────────
    const handlePickItem = (item: PickerItem) => {
        setPickerSelection(item);
        setStep('form');
    };

    const handleBack = () => {
        setStep('picker');
        setPickerSelection(null);
        setStatus(null);
    };

    if (!open) {
        return null;
    }

    // ── Group picker items by kind ──────────────────────
    const talItems = pickerItems.filter((item) => item.kind === 'tal');
    const danceItems = pickerItems.filter((item) => item.kind === 'dance');
    const performerItems = pickerItems.filter((item) => item.kind === 'performer');
    const actItems = pickerItems.filter((item) => item.kind === 'act');

    return (
        <div className="publish-modal__backdrop" onClick={onClose}>
            <div className="publish-modal" onClick={(event) => event.stopPropagation()}>
                <div className="publish-modal__header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {step === 'form' && (
                            <button className="icon-btn" onClick={handleBack} title="Back to asset list">
                                <ChevronLeft size={14} />
                            </button>
                        )}
                        <div>
                            <strong>Publish</strong>
                            <p>
                                {step === 'picker'
                                    ? 'Select an asset to save or publish.'
                                    : target ? `${target.kind} · ${target.name}` : ''}
                            </p>
                        </div>
                    </div>
                    <button className="icon-btn" onClick={onClose} title="Close publish menu">
                        <X size={12} />
                    </button>
                </div>

                {step === 'picker' ? (
                    <div className="publish-modal__body">
                        {pickerItems.length === 0 ? (
                            <div className="publish-modal__empty">
                                No publishable assets. Create or customize a Tal, Dance, Performer, or Act on the canvas to get started.
                            </div>
                        ) : (
                            <>
                                {talItems.length > 0 && (
                                    <PickerSection title="Tal" items={talItems} onPick={handlePickItem} icon={<FileText size={12} />} />
                                )}
                                {danceItems.length > 0 && (
                                    <PickerSection title="Dance" items={danceItems} onPick={handlePickItem} icon={<FileText size={12} />} />
                                )}
                                {performerItems.length > 0 && (
                                    <PickerSection title="Performers" items={performerItems} onPick={handlePickItem} icon={<Wand2 size={12} />} />
                                )}
                                {actItems.length > 0 && (
                                    <PickerSection title="Acts" items={actItems} onPick={handlePickItem} icon={<Zap size={12} />} />
                                )}
                            </>
                        )}

                        {!authUser?.authenticated && (
                            <div className="publish-modal__auth-callout">
                                <div>
                                    <strong>DOT sign-in required</strong>
                                    <p>
                                        Save Local and Publish use your DOT namespace.
                                        By signing in, you agree to the Dance of Tal Terms of Service:
                                        {' '}
                                        <a href={DOT_TOS_URL} target="_blank" rel="noreferrer">{DOT_TOS_URL}</a>
                                    </p>
                                </div>
                                <button
                                    className="publish-modal__action publish-modal__action--auth"
                                    onClick={() => {
                                        void startLogin(true);
                                    }}
                                    disabled={isAuthenticating}
                                >
                                    {isAuthenticating ? 'Signing in…' : 'Sign in'}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── Form Step ──────────────────────── */
                    <div className="publish-modal__body">
                        <div className="publish-modal__grid">
                            <label className="publish-modal__field">
                                <span>Slug</span>
                                <input className="text-input" value={slug} onChange={(event) => setSlug(event.target.value)} />
                            </label>
                            <label className="publish-modal__field">
                                <span>Description</span>
                                <input className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} />
                            </label>
                        </div>

                        <label className="publish-modal__field">
                            <span>Tags</span>
                            <input className="text-input" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="tag, tag" />
                        </label>

                        {performerPreflight.length > 0 ? (
                            <div className="publish-modal__preflight">
                                <strong>Performer dependencies</strong>
                                {performerPreflight.map((entry: any) => (
                                    <div key={`${entry.label}-${entry.detail}`} className={`publish-modal__preflight-row is-${entry.status}`}>
                                        <span>{entry.label}</span>
                                        <span>{entry.detail}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {markdownEditor ? (
                            <div className="publish-modal__preflight">
                                <strong>Markdown editor</strong>
                                <div className={`publish-modal__preflight-row ${markdownDirty ? 'is-ready' : 'is-missing'}`}>
                                    <span>Change state</span>
                                    <span>{markdownDirty ? 'Modified' : 'No changes since baseline'}</span>
                                </div>
                                {draft?.derivedFrom ? (
                                    <div className="publish-modal__preflight-row is-ready">
                                        <span>Derived from</span>
                                        <span>{draft.derivedFrom}</span>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {!authUser?.authenticated ? (
                            <div className="publish-modal__auth-callout">
                                <div>
                                    <strong>DOT sign-in required</strong>
                                    <p>
                                        Save Local and Publish use your DOT namespace.
                                        By signing in, you agree to the Dance of Tal Terms of Service:
                                        {' '}
                                        <a href={DOT_TOS_URL} target="_blank" rel="noreferrer">{DOT_TOS_URL}</a>
                                    </p>
                                </div>
                                <button
                                    className="publish-modal__action publish-modal__action--auth"
                                    onClick={() => {
                                        void startLogin(true);
                                    }}
                                    disabled={isAuthenticating}
                                >
                                    {isAuthenticating ? 'Signing in…' : 'Sign in'}
                                </button>
                            </div>
                        ) : null}

                        {status ? (
                            <div className={`publish-modal__status publish-modal__status--${status.tone}`}>
                                {status.message}
                            </div>
                        ) : null}

                        {publishBlockedReason ? (
                            <div className="publish-modal__status publish-modal__status--error">
                                {publishBlockedReason}
                            </div>
                        ) : null}
                    </div>
                )}

                {step === 'form' && (
                    <div className="publish-modal__footer">
                        <button className="publish-modal__action" onClick={handleSaveLocal} disabled={!canSaveOrPublish || !!isLocalAsset}>
                            <Save size={11} /> {action === 'save-local' ? 'Saving…' : 'Save Local'}
                        </button>
                        <button className="publish-modal__action publish-modal__action--primary" onClick={handlePublish} disabled={!canSaveOrPublish}>
                            <Upload size={11} /> {action === 'publish' ? 'Publishing…' : 'Publish'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

