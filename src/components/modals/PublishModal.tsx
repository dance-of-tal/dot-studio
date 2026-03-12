import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Upload, Save, ChevronLeft, FileText, Wand2, Workflow } from 'lucide-react';
import { useStudioStore } from '../../store';
import { api } from '../../api';
import { formatStudioApiErrorMessage } from '../../lib/api-errors';
import { buildPerformerAssetPayload, registryUrnFromRef, slugifyAssetName, unresolvedDeclaredMcpServerNames } from '../../lib/performers';
import { buildActAssetPayload, resolvePublishablePerformerUrn } from '../../lib/acts';
import { queryKeys, useAssetKind } from '../../hooks/queries';
import { useDotLogin } from '../../hooks/useDotLogin';
import { DOT_TOS_URL } from '../../lib/dot-terms';
import type { PerformerNode, StageAct } from '../../types';
import './PublishModal.css';

function parseTags(value: string) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

// ── Publishability helpers ──────────────────────────────

type PickerItemLocal = { kind: 'tal' | 'dance'; source: 'local'; urn: string; name: string; slug: string; issue?: string };
type PickerItemDraft = { kind: 'tal' | 'dance'; source: 'draft'; editorId: string; draftId: string; name: string; issue?: string };
type PickerItemPerformer = { kind: 'performer'; source: 'canvas'; performerId: string; name: string; issue?: string };
type PickerItemAct = { kind: 'act'; source: 'canvas'; actId: string; name: string; issue?: string };
type PickerItem = PickerItemLocal | PickerItemDraft | PickerItemPerformer | PickerItemAct;

type PerformerPreflightEntry = {
    label: string
    required: boolean
    status: 'ready' | 'draft' | 'missing'
    detail: string
}

type ActPreflightEntry = {
    nodeId: string
    performerName: string
    status: 'ready' | 'missing'
    detail: string
}

function isPerformerPublishable(p: PerformerNode): boolean {
    if (!p.meta?.derivedFrom) return true;
    if (p.meta.authoring?.slug || p.meta.authoring?.description || (p.meta.authoring?.tags && p.meta.authoring.tags.length > 0)) return true;
    return false;
}

function getPerformerIssue(p: PerformerNode): string | undefined {
    const hasTal = !!p.talRef;
    const hasDance = p.danceRefs.length > 0;
    if (!hasTal && !hasDance) {
        return 'Needs at least a Tal or Dance';
    }
    return undefined;
}

function isActPublishable(a: StageAct): boolean {
    if (!a.meta?.derivedFrom) return true;
    if (a.meta.authoring?.slug || a.meta.authoring?.description || (a.meta.authoring?.tags && a.meta.authoring.tags.length > 0)) return true;
    return false;
}

function getActIssue(a: StageAct, allPerformers: PerformerNode[]): string | undefined {
    const workerNodes = a.nodes.filter((n) => n.type !== 'parallel');
    if (workerNodes.length === 0) {
        return 'No nodes';
    }
    if (a.nodes.length < 2) {
        return 'Needs at least 2 nodes';
    }
    const unbound = workerNodes.filter((n: any) => !n.performerId);
    if (unbound.length === workerNodes.length) {
        return 'No performers assigned';
    }
    const allEmpty = workerNodes.every((n: any) => {
        if (!n.performerId) return true;
        const p = allPerformers.find((perf) => perf.id === n.performerId);
        return p ? !!getPerformerIssue(p) : true;
    });
    if (allEmpty) {
        return 'All performers are incomplete';
    }
    return undefined;
}

function buildPickerItems(args: {
    installedTals: any[]
    installedDances: any[]
    markdownEditors: ReturnType<typeof useStudioStore.getState>['markdownEditors']
    drafts: ReturnType<typeof useStudioStore.getState>['drafts']
    performers: PerformerNode[]
    acts: StageAct[]
}): PickerItem[] {
    const items: PickerItem[] = [];

    const localTals = args.installedTals.filter((asset) => asset.source === 'stage');
    for (const tal of localTals) {
        const hasContent = typeof tal.content === 'string' && tal.content.trim().length > 0;
        items.push({ kind: 'tal', source: 'local', urn: tal.urn, name: tal.name, slug: tal.name, issue: hasContent ? undefined : 'Empty content' });
    }

    const localDances = args.installedDances.filter((asset) => asset.source === 'stage');
    for (const dance of localDances) {
        const hasContent = typeof dance.content === 'string' && dance.content.trim().length > 0;
        items.push({ kind: 'dance', source: 'local', urn: dance.urn, name: dance.name, slug: dance.name, issue: hasContent ? undefined : 'Empty content' });
    }

    const localTalUrns = new Set(localTals.map((asset) => asset.urn));
    const localDanceUrns = new Set(localDances.map((asset) => asset.urn));
    for (const editor of args.markdownEditors) {
        const draft = args.drafts[editor.draftId];
        if (!draft) continue;
        if (draft.derivedFrom) {
            if (editor.kind === 'tal' && localTalUrns.has(draft.derivedFrom)) continue;
            if (editor.kind === 'dance' && localDanceUrns.has(draft.derivedFrom)) continue;
        }
        const hasContent = typeof draft.content === 'string' && draft.content.trim().length > 0;
        items.push({
            kind: editor.kind,
            source: 'draft',
            editorId: editor.id,
            draftId: editor.draftId,
            name: draft.name || `Untitled ${editor.kind}`,
            issue: hasContent ? undefined : 'Empty content',
        });
    }

    for (const performer of args.performers) {
        if (performer.ownerActId) continue;
        if (isPerformerPublishable(performer)) {
            items.push({ kind: 'performer', source: 'canvas', performerId: performer.id, name: performer.name, issue: getPerformerIssue(performer) });
        }
    }

    for (const act of args.acts) {
        if (isActPublishable(act)) {
            items.push({ kind: 'act', source: 'canvas', actId: act.id, name: act.name, issue: getActIssue(act, args.performers) });
        }
    }

    return items;
}

function buildPerformerPreflight(performer: PerformerNode | null): PerformerPreflightEntry[] {
    if (!performer) return [];

    return [
        performer.talRef ? { label: 'Tal', ref: performer.talRef, required: true } : null,
        ...performer.danceRefs.map((ref, index) => ({ label: `Dance ${index + 1}`, ref, required: false })),
    ]
        .filter(Boolean)
        .map((entry: any) => {
            const urn = registryUrnFromRef(entry.ref);
            if (urn) {
                return { ...entry, status: 'ready' as const, detail: urn };
            }
            if (entry.ref?.kind === 'draft') {
                return { ...entry, status: 'draft' as const, detail: `draft:${entry.ref.draftId}` };
            }
            return { ...entry, status: 'missing' as const, detail: 'not set' };
        });
}

function buildActPreflight(
    act: StageAct | null,
    performers: PerformerNode[],
    installedPerformers: any[],
    author: string | null,
): ActPreflightEntry[] {
    if (!act) return [];

    const savedPerformerUrns = new Set(
        installedPerformers
            .filter((asset) => asset.source === 'stage')
            .map((asset) => asset.urn),
    );

    return act.nodes
        .filter((node: any) => node.type !== 'parallel')
        .map((node: any) => {
            const boundPerformer = performers.find((item) => item.id === node.performerId);
            const performerUrn = resolvePublishablePerformerUrn(boundPerformer, author, {
                savedPerformerUrns,
            });
            return {
                nodeId: node.id,
                performerName: boundPerformer?.name || 'Unassigned',
                status: performerUrn ? 'ready' as const : 'missing' as const,
                detail: performerUrn || 'Save or publish this performer before publishing the act.',
            };
        });
}

function buildMarkdownAssetPayload(markdownEditor: NonNullable<ReturnType<typeof useStudioStore.getState>['markdownEditors'][number]>, draft: NonNullable<ReturnType<typeof useStudioStore.getState>['drafts'][string]>, slug: string, description: string, tags: string[]) {
    return {
        name: draft.name.trim() || (markdownEditor.kind === 'tal' ? 'Untitled Tal' : 'Untitled Dance'),
        slug: slug.trim(),
        description: description.trim() || draft.name.trim() || markdownEditor.kind,
        tags,
        content: typeof draft.content === 'string' ? draft.content : '',
    };
}

// ── Main Component ──────────────────────────────────────

export default function PublishModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const workingDir = useStudioStore((state) => state.workingDir);
    const performers = useStudioStore((state) => state.performers);
    const acts = useStudioStore((state) => state.acts);
    const drafts = useStudioStore((state) => state.drafts);
    const markdownEditors = useStudioStore((state) => state.markdownEditors);
    const updatePerformerAuthoringMeta = useStudioStore((state) => state.updatePerformerAuthoringMeta);
    const updateActAuthoringMeta = useStudioStore((state) => state.updateActAuthoringMeta);
    const updateMarkdownEditorBaseline = useStudioStore((state) => state.updateMarkdownEditorBaseline);
    const upsertDraft = useStudioStore((state) => state.upsertDraft);
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef);
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef);
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef);
    const queryClient = useQueryClient();
    const { authUser, startLogin, isAuthenticating } = useDotLogin();
    const { data: installedPerformers = [] } = useAssetKind('performer', open);
    const { data: installedTals = [] } = useAssetKind('tal', open);
    const { data: installedDances = [] } = useAssetKind('dance', open);

    // ── Step state ──────────────────────────────────────
    const [step, setStep] = useState<'picker' | 'form'>('picker');
    const [pickerSelection, setPickerSelection] = useState<PickerItem | null>(null);

    // ── Resolve selection to concrete store objects ──────
    const performer = pickerSelection?.kind === 'performer'
        ? performers.find((p) => p.id === pickerSelection.performerId) || null
        : null;
    const act = pickerSelection?.kind === 'act'
        ? acts.find((a) => a.id === pickerSelection.actId) || null
        : null;
    const markdownEditor = pickerSelection?.source === 'draft'
        ? markdownEditors.find((e) => e.id === pickerSelection.editorId) || null
        : null;
    const draft = markdownEditor ? drafts[markdownEditor.draftId] || null : null;

    // For local-saved tal/dance, we create a virtual draft-like target
    const isLocalAsset = pickerSelection?.source === 'local';

    const target = performer
        ? { kind: 'performer' as const, id: performer.id, name: performer.name }
        : act
            ? { kind: 'act' as const, id: act.id, name: act.name }
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
            installedTals,
            installedDances,
            markdownEditors,
            drafts,
            performers,
            acts,
        });
    }, [installedTals, installedDances, markdownEditors, drafts, performers, acts]);

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
        if (act) {
            setSlug(act.meta?.authoring?.slug || slugifyAssetName(act.name));
            setDescription(act.meta?.authoring?.description || act.description || act.name);
            setTagsText((act.meta?.authoring?.tags || []).join(', '));
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
    }, [step, pickerSelection, performer, act, draft, isLocalAsset]);

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

    const actPreflight = useMemo(() => {
        return buildActPreflight(act, performers, installedPerformers, authUser?.username || null);
    }, [act, authUser?.username, performers, installedPerformers]);

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
    const actHasBlockingBindings = useMemo(
        () => actPreflight.some((entry: any) => entry.status !== 'ready'),
        [actPreflight],
    );

    const publishBlockedReason = useMemo(() => {
        if (performer && performerHasBlockingDependencies) {
            return 'Save Tal and Dance dependencies as local or published assets before exporting this performer.';
        }
        if (performer && performerHasUnresolvedMcpPlaceholders) {
            return 'Map imported MCP placeholders to project MCP servers before publishing.';
        }
        if (act && actHasBlockingBindings) {
            return 'Resolve every act performer binding to a saved or published performer asset before exporting this act.';
        }
        return null;
    }, [act, actHasBlockingBindings, performer, performerHasBlockingDependencies, performerHasUnresolvedMcpPlaceholders]);

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

            if (target.kind === 'act' && act) {
                updateActAuthoringMeta(act.id, { slug, description, tags });
                const savedPerformerUrns = new Set(
                    installedPerformers
                        .filter((asset) => asset.source === 'stage')
                        .map((asset) => asset.urn),
                );
                const payload = buildActAssetPayload(act, performers, authUser?.username || null, {
                    name: act.name,
                    description,
                    tags,
                    savedPerformerUrns,
                });
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

            if (target.kind === 'act' && act) {
                updateActAuthoringMeta(act.id, { slug, description, tags });
                const savedPerformerUrns = new Set(
                    installedPerformers
                        .filter((asset) => asset.source === 'stage')
                        .map((asset) => asset.urn),
                );
                const payload = buildActAssetPayload(act, performers, authUser?.username || null, {
                    name: act.name,
                    description,
                    tags,
                    savedPerformerUrns,
                });
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
                                    <PickerSection title="Acts" items={actItems} onPick={handlePickItem} icon={<Workflow size={12} />} />
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

                        {actPreflight.length > 0 ? (
                            <div className="publish-modal__preflight">
                                <strong>Act performer bindings</strong>
                                {actPreflight.map((entry: any) => (
                                    <div key={entry.nodeId} className={`publish-modal__preflight-row is-${entry.status}`}>
                                        <span>{entry.performerName}</span>
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

// ── Picker Section ──────────────────────────────────────

function PickerSection({ title, items, onPick, icon }: {
    title: string;
    items: PickerItem[];
    onPick: (item: PickerItem) => void;
    icon: React.ReactNode;
}) {
    return (
        <div className="publish-modal__picker-section">
            <div className="publish-modal__picker-section-title">{title}</div>
            {items.map((item, index) => (
                <button
                    key={`${item.kind}-${index}`}
                    className={`publish-modal__picker-item${item.issue ? ' is-warning' : ''}`}
                    onClick={() => onPick(item)}
                >
                    <span className="publish-modal__picker-item-icon">{icon}</span>
                    <span className="publish-modal__picker-item-name">{itemDisplayName(item)}</span>
                    {item.issue ? (
                        <span className="publish-modal__picker-item-issue">{item.issue}</span>
                    ) : (
                        <span className="publish-modal__picker-item-badge">
                            {item.source === 'draft' ? 'unsaved' : item.source === 'local' ? 'saved' : ''}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

function itemDisplayName(item: PickerItem): string {
    return item.name;
}
