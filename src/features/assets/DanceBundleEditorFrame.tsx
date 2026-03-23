import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FileText, FolderPlus, FilePlus, Save, Eye, Upload, X, ChevronRight, ChevronDown, Folder, File } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudioStore } from '../../store';
import { api } from '../../api';
import { formatStudioApiErrorMessage } from '../../lib/api-errors';
import type { MarkdownEditorNode } from '../../types';

import { queryKeys, useDotAuthUser } from '../../hooks/queries';
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame';

import './DanceBundleEditorFrame.css';

// ── Types ────────────────────────────────────────────

interface TreeEntry {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: TreeEntry[];
}

interface OpenTab {
    path: string;
    name: string;
    content: string;
    dirty: boolean;
}

type DanceBundleEditorFrameData = Pick<MarkdownEditorNode, 'draftId' | 'kind' | 'baseline' | 'attachTarget' | 'width' | 'height'> & {
    workingDir: string;
    transformActive?: boolean;
    onActivateTransform?: () => void;
    onDeactivateTransform?: () => void;
};

export interface DanceBundleEditorFrameProps {
    id: string;
    data: DanceBundleEditorFrameData;
    selected?: boolean;
    type?: string;
}


// ── Helpers ──────────────────────────────────────────

function nameToSlug(name: string) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

function equalStringArray(left: string[] = [], right: string[] = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

// ── File Tree Component ──────────────────────────────

function FileTreeItem({
    entry,
    depth,
    activeFilePath,
    expandedDirs,
    onFileClick,
    onToggleDir,
}: {
    entry: TreeEntry;
    depth: number;
    activeFilePath: string | null;
    expandedDirs: Set<string>;
    onFileClick: (path: string, name: string) => void;
    onToggleDir: (path: string) => void;
}) {
    const isDir = entry.type === 'directory';
    const isExpanded = expandedDirs.has(entry.path);
    const isActive = !isDir && entry.path === activeFilePath;
    const depthClass = depth > 0 ? ` dance-bundle-editor__tree-item--indent-${Math.min(depth, 3)}` : '';

    return (
        <>
            <div
                className={`dance-bundle-editor__tree-item${isDir ? ' dance-bundle-editor__tree-item--dir' : ''}${isActive ? ' dance-bundle-editor__tree-item--active' : ''}${depthClass}`}
                onClick={() => isDir ? onToggleDir(entry.path) : onFileClick(entry.path, entry.name)}
            >
                {isDir ? (
                    isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                ) : null}
                {isDir ? <Folder size={12} /> : <File size={12} />}
                <span>{entry.name}</span>
            </div>
            {isDir && isExpanded && entry.children?.map((child) => (
                <FileTreeItem
                    key={child.path}
                    entry={child}
                    depth={depth + 1}
                    activeFilePath={activeFilePath}
                    expandedDirs={expandedDirs}
                    onFileClick={onFileClick}
                    onToggleDir={onToggleDir}
                />
            ))}
        </>
    );
}

// ── Main Component ───────────────────────────────────

export default function DanceBundleEditorFrame({ id, data, selected }: DanceBundleEditorFrameProps) {
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

    // ── Tree state
    const [tree, setTree] = useState<TreeEntry[]>([]);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['scripts', 'references', 'assets']));

    // ── Tab state
    const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
    const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

    // ── Status
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null);
    const [action, setAction] = useState<null | 'draft' | 'local' | 'publish'>(null);

    // ── New file dialog
    const [showNewFile, setShowNewFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileIsDir, setNewFileIsDir] = useState(false);
    const newFileInputRef = useRef<HTMLInputElement>(null);

    // ── Auto-save timer
    const saveTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // ── Load tree on mount / after changes
    const loadTree = useCallback(async () => {
        try {
            const entries = await api.drafts.danceBundle.tree(data.draftId);
            setTree(entries as TreeEntry[]);
        } catch {
            // ignore — draft may not be bundle-backed yet
        }
    }, [data.draftId]);

    useEffect(() => {
        loadTree();
    }, [loadTree]);

    // ── Open SKILL.md tab on mount
    useEffect(() => {
        if (openTabs.length === 0 && draft) {
            const content = typeof draft.content === 'string' ? draft.content : '';
            setOpenTabs([{ path: 'SKILL.md', name: 'SKILL.md', content, dirty: false }]);
            setActiveTabPath('SKILL.md');
        }
    }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived values
    const baseline = data.baseline || null;
    const currentName = typeof draft?.name === 'string' ? draft.name : '';
    const currentSlug = typeof draft?.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(currentName);
    const currentDescription = typeof draft?.description === 'string' ? draft.description : '';
    const currentTags = useMemo(() => (Array.isArray(draft?.tags) ? draft.tags : []), [draft?.tags]);
    const currentContent = typeof draft?.content === 'string' ? draft.content : '';

    const dirty = useMemo(() => {
        if (!baseline) return true;
        return baseline.name !== currentName
            || (baseline.slug || '') !== currentSlug
            || (baseline.description || '') !== currentDescription
            || !equalStringArray(baseline.tags || [], currentTags)
            || baseline.content !== currentContent;
    }, [baseline, currentContent, currentDescription, currentName, currentSlug, currentTags]);

    const activeTab = openTabs.find((t) => t.path === activeTabPath) || null;

    // ── File operations
    const handleFileClick = useCallback(async (filePath: string, name: string) => {
        // Already open? Just switch to it
        const existing = openTabs.find((t) => t.path === filePath);
        if (existing) {
            setActiveTabPath(filePath);
            return;
        }

        try {
            const result = await api.drafts.danceBundle.readFile(data.draftId, filePath);
            setOpenTabs((prev) => [...prev, { path: filePath, name, content: result.content, dirty: false }]);
            setActiveTabPath(filePath);
        } catch (err) {
            setStatus({ tone: 'error', message: `Failed to open ${name}: ${err instanceof Error ? err.message : 'unknown error'}` });
        }
    }, [data.draftId, openTabs]);

    const handleTabClose = useCallback((tabPath: string) => {
        setOpenTabs((prev) => prev.filter((t) => t.path !== tabPath));
        if (activeTabPath === tabPath) {
            setActiveTabPath(() => {
                const remaining = openTabs.filter((t) => t.path !== tabPath);
                return remaining.length > 0 ? remaining[remaining.length - 1].path : null;
            });
        }
    }, [activeTabPath, openTabs]);

    const handleToggleDir = useCallback((dirPath: string) => {
        setExpandedDirs((prev) => {
            const next = new Set(prev);
            if (next.has(dirPath)) next.delete(dirPath);
            else next.add(dirPath);
            return next;
        });
    }, []);

    const handleTabContentChange = useCallback((tabPath: string, newContent: string) => {
        setOpenTabs((prev) => prev.map((t) =>
            t.path === tabPath ? { ...t, content: newContent, dirty: true } : t,
        ));

        // Special handling: SKILL.md content syncs with draft store
        if (tabPath === 'SKILL.md') {
            if (draft) {
                upsertDraft({ ...draft, content: newContent, updatedAt: Date.now() });
            }
        }

        // Debounced save to server
        const existing = saveTimerRef.current.get(tabPath);
        if (existing) clearTimeout(existing);
        saveTimerRef.current.set(tabPath, setTimeout(async () => {
            saveTimerRef.current.delete(tabPath);
            try {
                await api.drafts.danceBundle.writeFile(data.draftId, tabPath, newContent);
                setOpenTabs((prev) => prev.map((t) =>
                    t.path === tabPath ? { ...t, dirty: false } : t,
                ));
            } catch {
                // silently fail — user can retry
            }
        }, 1500));
    }, [data.draftId, draft, upsertDraft]);

    // ── New file/directory
    const handleNewFileSubmit = useCallback(async () => {
        if (!newFileName.trim()) return;
        try {
            await api.drafts.danceBundle.createFile(data.draftId, newFileName.trim(), newFileIsDir);
            setShowNewFile(false);
            setNewFileName('');
            setNewFileIsDir(false);
            await loadTree();
        } catch (err) {
            setStatus({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to create file' });
        }
    }, [data.draftId, newFileName, newFileIsDir, loadTree]);

    // ── Attach target handling
    const applyAttachTarget = (nextRef: { kind: 'draft' | 'registry'; draftId?: string; urn?: string }) => {
        const attachTarget = data.attachTarget;
        if (!attachTarget?.performerId) return;
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

    // ── Actions (Save Draft, Save Local, Publish)
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
                description: currentDescription.trim() || currentName.trim() || 'dance',
                tags: currentTags,
                content: currentContent,
            };
            const result = await api.dot.saveLocalAsset('dance', currentSlug.trim(), payload, authUser?.username || undefined);
            applyAttachTarget({ kind: 'registry', urn: result.urn });
            persistBaseline(result.urn);
            await invalidateAssets();
            setStatus({
                tone: 'success',
                message: result.existed
                    ? `Updated local dance asset at ${result.urn}.`
                    : `Saved local dance asset at ${result.urn}.`,
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
                description: currentDescription.trim() || currentName.trim() || 'dance',
                tags: currentTags,
                content: currentContent,
            };
            const result = await api.dot.publishAsset('dance', currentSlug.trim(), payload, payload.tags, true);
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

    const stopCanvasEvent = (event: React.SyntheticEvent) => {
        event.stopPropagation();
    };

    if (!draft) {
        return (
            <div className="dance-bundle-editor dance-bundle-editor--missing">
                <div className="dance-bundle-editor__title">
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
            className="dance-bundle-editor"
            width={Number(data.width || 720)}
            height={Number(data.height || 480)}
            transformActive={!!data.transformActive}
            onActivateTransform={data.onActivateTransform as (() => void) | undefined}
            onDeactivateTransform={data.onDeactivateTransform as (() => void) | undefined}
            selected={!!selected}
            minWidth={560}
            minHeight={340}
            headerStart={(
                <div className="dance-bundle-editor__title">
                    <FileText size={13} />
                    <span>Dance Bundle Editor</span>
                    {dirty ? <span className="dance-bundle-editor__dirty">Unsaved</span> : null}
                </div>
            )}
            headerEnd={(
                <div className="dance-bundle-editor__actions">
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
            {/* Meta fields */}
            <div className="dance-bundle-editor__meta nodrag nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="dance-bundle-editor__meta-row">
                    <label className="dance-bundle-editor__field">
                        <span className="dance-bundle-editor__field-label">Name</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={currentName}
                            onChange={(event) => upsertDraft({ ...draft, name: event.target.value, updatedAt: Date.now() })}
                            placeholder="Enter asset name"
                        />
                    </label>
                    <label className="dance-bundle-editor__field">
                        <span className="dance-bundle-editor__field-label">Description</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={currentDescription}
                            onChange={(event) => upsertDraft({ ...draft, description: event.target.value, updatedAt: Date.now() })}
                            placeholder="What this skill does"
                        />
                    </label>
                </div>
            </div>

            {/* Body: file tree + editor */}
            <div className="dance-bundle-editor__body" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                {/* File tree pane */}
                <div className="dance-bundle-editor__tree-pane nodrag nowheel">
                    <div className="dance-bundle-editor__tree-header">
                        <span className="dance-bundle-editor__tree-label">Files</span>
                        <div className="dance-bundle-editor__tree-actions">
                            <button className="icon-btn" title="New file" onClick={() => { setShowNewFile(true); setNewFileIsDir(false); setTimeout(() => newFileInputRef.current?.focus(), 50); }}>
                                <FilePlus size={11} />
                            </button>
                            <button className="icon-btn" title="New folder" onClick={() => { setShowNewFile(true); setNewFileIsDir(true); setTimeout(() => newFileInputRef.current?.focus(), 50); }}>
                                <FolderPlus size={11} />
                            </button>
                        </div>
                    </div>
                    <div className="dance-bundle-editor__tree-content">
                        {tree.length === 0 ? (
                            <div className="dance-bundle-editor__tree-empty">Loading…</div>
                        ) : (
                            tree.map((entry) => (
                                <FileTreeItem
                                    key={entry.path}
                                    entry={entry}
                                    depth={0}
                                    activeFilePath={activeTabPath}
                                    expandedDirs={expandedDirs}
                                    onFileClick={handleFileClick}
                                    onToggleDir={handleToggleDir}
                                />
                            ))
                        )}
                    </div>
                    {showNewFile && (
                        <div className="dance-bundle-editor__new-file-input">
                            <input
                                ref={newFileInputRef}
                                className="nodrag nowheel"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleNewFileSubmit();
                                    if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); }
                                }}
                                onBlur={() => { if (!newFileName.trim()) setShowNewFile(false); }}
                                placeholder={newFileIsDir ? 'directory-name' : 'scripts/helper.ts'}
                            />
                        </div>
                    )}
                </div>

                {/* Editor pane */}
                <div className="dance-bundle-editor__editor-pane">
                    {/* Tabs */}
                    <div className="dance-bundle-editor__tabs nodrag nowheel">
                        {openTabs.map((tab) => (
                            <div
                                key={tab.path}
                                className={`dance-bundle-editor__tab${tab.path === activeTabPath ? ' dance-bundle-editor__tab--active' : ''}`}
                                onClick={() => setActiveTabPath(tab.path)}
                            >
                                <span>{tab.name}{tab.dirty ? ' •' : ''}</span>
                                {tab.path !== 'SKILL.md' && (
                                    <button
                                        className="dance-bundle-editor__tab-close"
                                        onClick={(e) => { e.stopPropagation(); handleTabClose(tab.path); }}
                                        title="Close tab"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Editor area */}
                    {activeTab ? (
                        <textarea
                            className="dance-bundle-editor__textarea nodrag nowheel"
                            value={activeTab.content}
                            onChange={(event) => handleTabContentChange(activeTab.path, event.target.value)}
                            spellCheck={false}
                            placeholder="Write skill content here…"
                        />
                    ) : (
                        <div className="dance-bundle-editor__no-file">
                            Select a file from the tree to edit
                        </div>
                    )}
                </div>
            </div>

            {/* Status bar */}
            {status ? (
                <div className={`dance-bundle-editor__status dance-bundle-editor__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}
            {action ? (
                <div className="dance-bundle-editor__status">
                    {action === 'draft' ? 'Saving draft…' : action === 'local' ? 'Saving local asset…' : 'Publishing…'}
                </div>
            ) : null}
        </CanvasWindowFrame>
    );
}
