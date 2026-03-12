import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { NodeResizer, useStore } from '@xyflow/react';
import { useStudioStore } from '../../store';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useFileMentions, type FileMention } from '../../hooks/useFileMentions';
import { useAgents, useAssetKind, useAssets, useMcpServers, useRuntimeTools } from '../../hooks/queries';
import { Send, Square, File as FileIcon, X, RotateCcw, Sparkles, Hammer, Lightbulb, EyeOff, Hexagon, Zap, Cpu, Server, ArrowLeft, Pencil } from 'lucide-react';
import ThreadBody from './ThreadBody';
import { assetRefKey, buildAssetCardMap, buildMcpServerMap, hasModelConfig, resolvePerformerAgentId, resolvePerformerPresentation, resolvePerformerRuntimeConfig } from '../../lib/performers';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { loadMaterialFileIconForPath } from '../../lib/material-file-icons';
import CanvasWindowFrame from './CanvasWindowFrame';
import ChatMessageContent from './ChatMessageContent';
import useTransformChrome from './useTransformChrome';
import PerformerComposeCards from './PerformerComposeCards';
import PerformerAdvancedSettings from './PerformerAdvancedSettings';
import ModelVariantSelect from './ModelVariantSelect';
import ModelQuickPicker from './ModelQuickPicker';
import AgentSelect from './AgentSelect';
import './AgentFrame.css';
import './AgentChat.css';
import './AgentInput.css';

/* ── Tool Call Card ───────────────────────────────── */
import {
    formatAgentLabel,
    buildDanceSearchSections,
    formatChatAttachments,
    shouldShowChatLoading,
} from './agent-frame-utils'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'

function PerformerHeaderMeta({
    modelLabel,
    modelTitle,
    talLabel,
    danceSummary,
}: {
    modelLabel: string | null
    modelTitle: string | null
    talLabel: string | null
    danceSummary: string | null
}) {
    return (
        <div className="figma-frame__badges">
            {talLabel ? (
                <span className="figma-frame__badge" title={`Tal: ${talLabel}`}>
                    {talLabel}
                </span>
            ) : null}
            {danceSummary ? (
                <span className="figma-frame__badge" title={`Dance: ${danceSummary}`}>
                    {danceSummary}
                </span>
            ) : null}
            {modelLabel ? (
                <span className="figma-frame__badge" title={modelTitle || modelLabel}>
                    {modelLabel}
                </span>
            ) : null}
        </div>
    );
}

function MentionFileIcon({ path }: { path: string }) {
    const [iconUrl, setIconUrl] = useState('')

    useEffect(() => {
        let active = true

        void loadMaterialFileIconForPath(path).then((url) => {
            if (active) {
                setIconUrl(url)
            }
        })

        return () => {
            active = false
        }
    }, [path])

    return (
        <span
            className="mention-result__icon"
            style={{
                ['--mention-icon' as string]: iconUrl ? `url(${iconUrl})` : 'none',
                background: iconUrl ? 'var(--text-secondary)' : 'transparent',
            }}
            aria-hidden="true"
        />
    )
}

export default function AgentFrame({ data, id }: any) {
    const {
        selectedPerformerId, focusedPerformerId, editingTarget,
        chats, sendMessage, abortChat, loadingPerformerId, setPerformerAgentId, executeSlashCommand, summarizeSession,
        togglePerformerVisibility,
        closeEditor,
        performers,
        drafts,
        createMarkdownEditor,
        updatePerformerName,
        setPerformerTalRef,
        setPerformerDanceDeliveryMode,
        setPerformerModel,
        setPerformerModelVariant,
        removePerformerMcp,
        setPerformerMcpBinding,
        removePerformerDance,
        setPerformerAutoCompact,
    } = useStudioStore();

    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<FileMention[]>([]);
    const [turnDanceSelections, setTurnDanceSelections] = useState<TurnDanceSelection[]>([]);
    const [danceSearchIndex, setDanceSearchIndex] = useState(0);
    const [editTab, setEditTab] = useState<'basic' | 'advanced'>('basic');
    const [showModelPicker, setShowModelPicker] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const isSelected = selectedPerformerId === id;
    const isFocused = focusedPerformerId === id;
    const isLoading = loadingPerformerId === id;
    const messages = chats[id] || [];
    const modelConfigured = hasModelConfig(data.model);
    const isEditMode = editingTarget?.type === 'performer' && editingTarget.id === id;
    const performer = performers.find((item) => item.id === id) || null;
    const { data: agents = [] } = useAgents(isSelected || isEditMode);
    const { data: danceAssets = [] } = useAssetKind('dance', isSelected || isFocused || isEditMode);
    const { data: assetInventory = [] } = useAssets(isSelected || isEditMode);
    const { data: mcpServers = [] } = useMcpServers(isSelected || isEditMode);
    const {
        isTransformChromeActive,
        showResizeChrome,
        activateTransformChrome,
        handleFramePointerDownCapture,
        handleResizeStart,
        handleResizeEnd,
    } = useTransformChrome({
        active: !!data.transformActive,
        onActivate: data.onActivateTransform as (() => void) | undefined,
        onDeactivate: data.onDeactivateTransform as (() => void) | undefined,
    });
    const hasFrameChrome = isSelected || showResizeChrome;

    const { isOver: isTalOver, setNodeRef: setTalRef } = useDroppable({
        id: `performer-edit-tal-${id}`,
        data: { performerId: id, type: 'tal' },
    });
    const { isOver: isDanceOver, setNodeRef: setDanceRef } = useDroppable({
        id: `performer-edit-dance-${id}`,
        data: { performerId: id, type: 'dance' },
    });
    const { isOver: isModelOver, setNodeRef: setModelRef } = useDroppable({
        id: `performer-edit-model-${id}`,
        data: { performerId: id, type: 'model' },
    });
    const { isOver: isMcpOver, setNodeRef: setMcpRef } = useDroppable({
        id: `performer-edit-mcp-${id}`,
        data: { performerId: id, type: 'mcp' },
    });

    const rfWidth = useStore((s) => s.width);
    const rfHeight = useStore((s) => s.height);
    const selectedAgentId = performer
        ? resolvePerformerAgentId(performer)
        : (data.agentId || (data.planMode ? 'plan' : 'build'));
    const selectedAgent = useMemo(
        () => agents.find((agent) => agent.name === selectedAgentId) || null,
        [agents, selectedAgentId],
    );
    const buildAgent = useMemo(
        () => agents.find((agent) => agent.name === 'build') || null,
        [agents],
    );
    const planAgent = useMemo(
        () => agents.find((agent) => agent.name === 'plan') || null,
        [agents],
    );
    const isPlanAgent = selectedAgentId === 'plan';
    const performerPresentation = useMemo(() => (
        performer
            ? resolvePerformerPresentation(
                performer,
                buildAssetCardMap(assetInventory),
                buildMcpServerMap(mcpServers),
                drafts,
            )
            : {
                talAsset: null,
                danceAssets: [],
                mcpServers: [],
                mcpPlaceholders: [],
                declaredMcpServerNames: [],
            }
    ), [assetInventory, drafts, mcpServers, performer]);
    const runtimeConfig = useMemo(
        () => performer ? resolvePerformerRuntimeConfig(performer) : null,
        [performer],
    );
    const { data: runtimeTools } = useRuntimeTools(
        runtimeConfig?.model || null,
        runtimeConfig?.mcpServerNames || [],
        (isSelected || isEditMode) && !!runtimeConfig,
    );
    const mcpBindingRows = useMemo(
        () => (performerPresentation.declaredMcpServerNames || [])
            .map((placeholderName) => ({
                placeholderName,
                serverName: performer?.mcpBindingMap?.[placeholderName] || null,
            })),
        [performer?.mcpBindingMap, performerPresentation.declaredMcpServerNames],
    );
    const mcpBindingOptions = useMemo(
        () => mcpServers.map((server) => ({
            name: server.name,
            disabled: server.enabled === false,
        })),
        [mcpServers],
    );

    useEffect(() => {
        if (!performer?.mcpBindingMap) {
            return;
        }
        const validNames = new Set(
            mcpServers
                .filter((server) => server.enabled !== false)
                .map((server) => server.name),
        );
        for (const [placeholderName, serverName] of Object.entries(performer.mcpBindingMap)) {
            if (!serverName || validNames.has(serverName)) {
                continue;
            }
            setPerformerMcpBinding(id, placeholderName, null);
        }
    }, [id, mcpServers, performer?.mcpBindingMap, setPerformerMcpBinding]);

    const openAssetEditor = useCallback(async (
        kind: 'tal' | 'dance',
        targetRef: any,
        attachMode: 'tal' | 'dance-new' | 'dance-replace',
    ) => {
        try {
            if (!targetRef) {
                createMarkdownEditor(kind, {
                    attachTarget: performer ? {
                        performerId: performer.id,
                        mode: attachMode,
                        targetRef: attachMode === 'dance-replace' ? null : undefined,
                    } : undefined,
                });
                return;
            }

            if (targetRef.kind === 'draft') {
                const draft = drafts[targetRef.draftId];
                if (!draft) {
                    throw new Error('Draft not found.');
                }
                createMarkdownEditor(kind, {
                    source: {
                        name: draft.name,
                        slug: draft.slug,
                        description: draft.description,
                        tags: draft.tags,
                        content: typeof draft.content === 'string' ? draft.content : '',
                        derivedFrom: draft.derivedFrom || null,
                    },
                    attachTarget: performer ? {
                        performerId: performer.id,
                        mode: attachMode,
                        targetRef,
                    } : undefined,
                });
                return;
            }

            const [, author, name] = String(targetRef.urn || '').split('/');
            if (!author || !name) {
                throw new Error('Invalid asset reference.');
            }

            let detail: any;
            try {
                detail = await api.assets.get(kind, author.replace(/^@/, ''), name);
            } catch {
                detail = await api.assets.getRegistry(kind, author.replace(/^@/, ''), name);
            }

            createMarkdownEditor(kind, {
                source: {
                    name: detail.name || name,
                    slug: detail.slug || name,
                    description: detail.description || detail.name || name,
                    tags: Array.isArray(detail.tags) ? detail.tags : [],
                    content: typeof detail.content === 'string' ? detail.content : '',
                    derivedFrom: detail.urn || targetRef.urn || null,
                },
                attachTarget: performer ? {
                    performerId: performer.id,
                    mode: attachMode,
                    targetRef,
                } : undefined,
            });
        } catch (error) {
            console.error('Failed to open markdown editor', error);
            showToast(`Studio could not open the ${kind} editor for this performer.`, 'error', {
                title: `${kind === 'tal' ? 'Tal' : 'Dance'} editor failed`,
                dedupeKey: `performer-editor-open:${id}:${kind}:${targetRef.kind}:${targetRef.kind === 'registry' ? targetRef.urn : targetRef.draftId}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void openAssetEditor(kind, targetRef, attachMode)
                },
            });
        }
    }, [createMarkdownEditor, drafts, performer]);

    const {
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        handleInputChange: onSlashInputChange,
        handleKeyDown: onSlashKeyDown
    } = useSlashCommands(id, input, setInput);

    const {
        inputRef,
        isMentioning,
        mentionResults,
        mentionIndex,
        setMentionIndex,
        checkMention,
        extractMentionText,
        setIsMentioning
    } = useFileMentions();

    const danceSlashMatch = useMemo(() => {
        const trimmed = input.trimStart();
        if (!trimmed.startsWith('/')) {
            return null;
        }
        return trimmed.slice(1).trim().toLowerCase();
    }, [input]);

    const danceSearchSections = useMemo(() => {
        return buildDanceSearchSections(danceAssets, danceSlashMatch, drafts, performer);
    }, [danceAssets, danceSlashMatch, drafts, performer]);

    const danceSearchResults = useMemo<DanceSearchItem[]>(
        () => danceSearchSections.flatMap((section) => section.items),
        [danceSearchSections],
    );

    const addTurnDanceSelection = useCallback((item: DanceSearchItem) => {
        setTurnDanceSelections((current) => (
            current.some((selection) => assetRefKey(selection.ref) === assetRefKey(item.ref))
                ? current
                : [...current, { ref: item.ref, label: item.label, scope: item.scope }]
        ));
        setInput('');
        setShowSlashMenu(false);
        setDanceSearchIndex(0);
        inputRef.current?.focus();
    }, [inputRef, setShowSlashMenu]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (editTab !== 'basic') {
            setShowModelPicker(false);
        }
    }, [editTab]);

    useEffect(() => {
        setDanceSearchIndex(0);
    }, [danceSlashMatch]);

    // Prevent wheel events from reaching ReactFlow's d3-zoom so that
    // scrolling over the performer panel scrolls chat content instead of zooming the canvas.
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.stopPropagation();
        };
        el.addEventListener('wheel', handler, { passive: true });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading) return;
        if (!modelConfigured) {
            return;
        }
        if (danceSlashMatch !== null) {
            return;
        }
        const text = input.trim();
        setInput('');
        setShowSlashMenu(false);
        setIsMentioning(false);

        const cmdPattern = /^\/(undo|redo|share|compact)$/;
        if (cmdPattern.test(text)) {
            executeSlashCommand(id, text);
            return;
        }

        const formattedAttachments = formatChatAttachments(attachments)

        if (runtimeTools && runtimeTools.selectedMcpServers.length > 0 && runtimeTools.resolvedTools.length === 0 && runtimeTools.unavailableDetails.length > 0) {
            showToast(
                `Selected MCP servers are unavailable: ${runtimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.`,
                'error',
                {
                    title: 'MCP tools unavailable',
                    dedupeKey: `performer-mcp-block:${id}`,
                },
            );
            return;
        }

        if (runtimeTools && runtimeTools.resolvedTools.length > 0 && runtimeTools.unavailableDetails.length > 0) {
            showToast(
                `Some MCP tools are unavailable: ${runtimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.`,
                'warning',
                {
                    title: 'Partial MCP availability',
                    dedupeKey: `performer-mcp-warn:${id}`,
                },
            );
        }

        sendMessage(id, text, formattedAttachments, turnDanceSelections.map((selection) => selection.ref));
        setAttachments([]);
        setTurnDanceSelections([]);
    }, [input, isLoading, modelConfigured, danceSlashMatch, id, executeSlashCommand, setShowSlashMenu, attachments, sendMessage, setIsMentioning, turnDanceSelections, runtimeTools]);

    const handleInputChange = (val: string) => {
        onSlashInputChange(val);
        checkMention(val, inputRef.current?.selectionStart ?? val.length);
    };

    const handleKeyDownWrapper = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;

        if (danceSlashMatch !== null) {
            if (danceSearchResults.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setDanceSearchIndex((index) => Math.min(index + 1, danceSearchResults.length - 1));
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setDanceSearchIndex((index) => Math.max(index - 1, 0));
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addTurnDanceSelection(danceSearchResults[danceSearchIndex]);
                    return;
                }
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setInput('');
                setShowSlashMenu(false);
                setDanceSearchIndex(0);
                return;
            }
        }

        if (isMentioning && mentionResults.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((i) => (i < mentionResults.length - 1 ? i + 1 : i));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((i) => (i > 0 ? i - 1 : i));
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const selectedFile = mentionResults[mentionIndex];
                const newText = extractMentionText();
                if (newText !== null) {
                    setInput(newText);
                    setAttachments(prev => [...prev, selectedFile]);
                }
                return;
            }
            if (e.key === 'Escape') {
                setIsMentioning(false);
                return;
            }
        }

        const handled = onSlashKeyDown(e, (text) => {
            if (!modelConfigured) {
                return;
            }
            sendMessage(id, text, [], turnDanceSelections.map((selection) => selection.ref));
            setTurnDanceSelections([]);
        });
        if (!handled && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setAttachments(prev => [...prev, {
                            name: file.name,
                            path: file.name,
                            absolute: event.target!.result as string, // base64 data URI
                            type: file.type
                        }]);
                    }
                };
                reader.readAsDataURL(file);
            });
        }
        e.dataTransfer.clearData();
    };

    return (
        <CanvasWindowFrame
            className={`nowheel ${hasFrameChrome ? 'figma-frame--active' : ''} ${isFocused ? 'figma-frame--focused' : ''} ${hasFrameChrome && !showResizeChrome ? 'figma-frame--content-active' : ''}`}
            width={isFocused ? Math.max(rfWidth - 40, 320) : (data.width || 320)}
            height={isFocused ? Math.max(rfHeight - 140, 400) : (data.height || 400)}
            onPointerDownCapture={handleFramePointerDownCapture}
            chrome={(
                <>
                    <NodeResizer
                        color="var(--text-muted)"
                        lineStyle={{ borderWidth: 0 }}
                        isVisible={showResizeChrome}
                        minWidth={280}
                        minHeight={320}
                        handleStyle={{ width: 8, height: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-strong)' }}
                        onResizeStart={handleResizeStart}
                        onResizeEnd={handleResizeEnd}
                    />
                </>
            )}
            dragHandleActive={isTransformChromeActive}
            onActivateTransform={activateTransformChrome}
            headerStart={<span className="figma-frame__name">{data.name}</span>}
            headerEnd={(
                <div className="figma-frame__header-actions">
                    <PerformerHeaderMeta
                        modelLabel={data.modelLabel || null}
                        modelTitle={data.modelTitle || null}
                        talLabel={data.talLabel || null}
                        danceSummary={data.danceSummary || null}
                    />
                    {!isEditMode && (
                        <button
                            className="icon-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                useStudioStore.getState().openPerformerEditor(id);
                            }}
                            title="Edit performer"
                            style={{ padding: '0 4px', opacity: 0.7 }}
                        >
                            <Pencil size={11} />
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePerformerVisibility(id);
                        }}
                        title="Hide from Canvas"
                        style={{ padding: '0 4px', opacity: 0.7 }}
                    >
                        <EyeOff size={11} />
                    </button>
                </div>
            )}
            bodyClassName="nowheel nodrag"
            bodyRef={bodyRef}
        >
            {isEditMode ? (
                <>
                    <div className="figma-edit-workbench__header">
                        <button
                            className="figma-edit-workbench__back"
                            onClick={(event) => {
                                event.stopPropagation();
                                closeEditor();
                            }}
                            title="Back to chat"
                        >
                            <ArrowLeft size={12} />
                        </button>
                        <span className="section-title">Edit</span>
                        <div className="figma-edit-workbench__actions">
                            <button
                                className={`tab ${editTab === 'basic' ? 'active' : ''}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setEditTab('basic');
                                }}
                                title="Basic composition"
                            >
                                Basic
                            </button>
                            <button
                                className={`tab ${editTab === 'advanced' ? 'active' : ''}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setEditTab('advanced');
                                }}
                                title="Advanced settings"
                            >
                                Advanced
                            </button>
                        </div>
                    </div>
                    <PerformerComposeCards
                        hidden={editTab !== 'basic'}
                        cards={[
                            {
                                key: 'tal',
                                title: 'Tal',
                                description: performerPresentation.talAsset ? '' : 'No Tal connected yet.',
                                hint: 'Drag & drop from Asset Library',
                                icon: <Hexagon size={12} />,
                                items: performerPresentation.talAsset ? [{
                                    key: performerPresentation.talAsset.urn,
                                    label: performerPresentation.talAsset.name,
                                    description: performerPresentation.talAsset.description || null,
                                    onRemove: () => setPerformerTalRef(id, null),
                                }] : undefined,
                                isOver: isTalOver,
                                setNodeRef: setTalRef,
                                onClick: () => {
                                    if (performer?.talRef) {
                                        void openAssetEditor('tal', performer.talRef, 'tal');
                                    } else {
                                        void openAssetEditor('tal', null, 'tal');
                                    }
                                },
                            },
                            {
                                key: 'dances',
                                title: 'Dances',
                                description: performerPresentation.danceAssets.length > 0 ? '' : 'No Dances connected yet.',
                                hint: 'Drag & drop from Asset Library',
                                icon: <Zap size={12} />,
                                items: performerPresentation.danceAssets.map((asset, index) => ({
                                    key: `${asset.urn}:${index}`,
                                    label: asset.name,
                                    description: asset.description || null,
                                    onRemove: () => removePerformerDance(id, performer?.danceRefs[index] ? assetRefKey(performer.danceRefs[index]) || asset.urn : asset.urn),
                                })),
                                isOver: isDanceOver,
                                setNodeRef: setDanceRef,
                                onClick: () => setEditTab('advanced'),
                            },
                            {
                                key: 'model',
                                title: 'Model',
                                description: performer?.model || performer?.modelPlaceholder ? '' : 'No model selected yet.',
                                hint: 'Drag & drop from Asset Library',
                                icon: <Cpu size={12} />,
                                items: performer?.model ? [{
                                    key: `${performer.model.provider}:${performer.model.modelId}`,
                                    label: performer.model.modelId,
                                    description: performer.model.provider,
                                    onRemove: () => setPerformerModel(id, null),
                                }] : performer?.modelPlaceholder ? [{
                                    key: `${performer.modelPlaceholder.provider}:${performer.modelPlaceholder.modelId}:placeholder`,
                                    label: performer.modelPlaceholder.modelId,
                                    description: `Missing in current Studio runtime · ${performer.modelPlaceholder.provider}`,
                                    onRemove: () => setPerformerModel(id, null),
                                }] : undefined,
                                isOver: isModelOver,
                                setNodeRef: setModelRef,
                                onClick: () => setShowModelPicker((current) => !current),
                            },
                            {
                                key: 'mcp',
                                title: 'MCP',
                                description: performerPresentation.mcpServers.length > 0 || performerPresentation.mcpPlaceholders.length > 0 ? '' : 'No MCP servers connected yet.',
                                hint: 'Drag & drop from Asset Library',
                                icon: <Server size={12} />,
                                items: [
                                    ...performerPresentation.mcpServers.map((server) => ({
                                        key: server.name,
                                        label: server.name,
                                        description: `${server.status}${server.tools.length ? ` · ${server.tools.length} tools` : ''}`,
                                        onRemove: () => removePerformerMcp(id, server.name),
                                    })),
                                    ...performerPresentation.mcpPlaceholders.map((name) => ({
                                        key: `placeholder:${name}`,
                                        label: name,
                                        description: 'Imported from asset · not mapped in Asset Library MCP catalog',
                                    })),
                                ],
                                isOver: isMcpOver,
                                setNodeRef: setMcpRef,
                                onClick: () => setEditTab('advanced'),
                            },
                        ]}
                    />
                    <ModelQuickPicker
                        open={editTab === 'basic' && showModelPicker}
                        currentModel={performer?.model || null}
                        onSelect={(model) => {
                            setPerformerModel(id, model)
                            setShowModelPicker(false)
                        }}
                        onClose={() => setShowModelPicker(false)}
                        title="Choose a performer model"
                    />
                    {editTab === 'advanced' ? (
                        <PerformerAdvancedSettings
                            performer={performer}
                            talLabel={data.talLabel || null}
                            modelLabel={performer?.model?.modelId || null}
                            agentLabel={formatAgentLabel(selectedAgent?.name) || 'Build'}
                            mcpSummary={data.mcpSummary || null}
                            onNameChange={(value) => updatePerformerName(id, value)}
                            onDanceDeliveryModeChange={(value) => setPerformerDanceDeliveryMode(id, value)}
                            onOpenTalEditor={() => void openAssetEditor('tal', performer?.talRef || null, 'tal')}
                            onCreateDanceDraft={() => void openAssetEditor('dance', null, 'dance-new')}
                            onEditDance={(ref) => void openAssetEditor('dance', ref, 'dance-replace')}
                            onRemoveDance={(ref) => removePerformerDance(id, ref.kind === 'draft' ? ref.draftId : ref.urn)}
                            onClearModel={() => setPerformerModel(id, null)}
                            onRemoveMcp={(serverName) => removePerformerMcp(id, serverName)}
                            onSetMcpBinding={(placeholderName, serverName) => setPerformerMcpBinding(id, placeholderName, serverName)}
                            onAutoCompactChange={(enabled) => setPerformerAutoCompact(id, enabled)}
                            mcpBindings={mcpBindingRows}
                            mcpOptions={mcpBindingOptions}
                            runtimeControls={(
                                <>
                                    <AgentSelect
                                        value={performer?.agentId || null}
                                        onChange={(value) => setPerformerAgentId(id, value)}
                                        titlePrefix="Performer agent"
                                    />
                                    <ModelVariantSelect
                                        model={performer?.model || null}
                                        value={performer?.modelVariant || null}
                                        onChange={(value) => setPerformerModelVariant(id, value)}
                                        titlePrefix="Performer variant"
                                    />
                                </>
                            )}
                            runtimeStatus={runtimeTools ? (
                                <div className="adv-section__summary">
                                    {runtimeTools.resolvedTools.length > 0
                                        ? `Resolved tools: ${runtimeTools.resolvedTools.join(', ')}`
                                        : runtimeTools.selectedMcpServers.length > 0
                                            ? 'No MCP tools resolved for the current model yet.'
                                            : 'No MCP servers selected.'}
                                    {runtimeTools.unavailableDetails.length > 0 ? ` Unavailable: ${runtimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.` : ''}
                                </div>
                            ) : null}
                        />
                    ) : null}
                </>
            ) : (
                <ThreadBody
                    messages={messages}
                    loading={shouldShowChatLoading(messages, isLoading)}
                    renderEmpty={() => (
                        <div className="chat-empty-state">
                            <Sparkles size={28} className="empty-icon" />
                            <p className="empty-title">Start a conversation</p>
                            <p className="empty-subtitle">Send a message to begin</p>
                        </div>
                    )}
                    renderMessage={(msg) => (
                        <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`}>
                            {msg.role === 'user' ? (
                                <div className="user-input-box">
                                    <span className="user-input-text">{msg.content}</span>
                                    <button
                                        className="user-input-revert"
                                        onClick={() => setInput(msg.content)}
                                        title="Re-use this message"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                </div>
                            ) : (
                                <ChatMessageContent message={msg} />
                            )}
                        </div>
                    )}
                    renderLoading={() => (
                        <div className="thread-msg thread-msg--assistant">
                            <div className="assistant-body">
                                <div className="loading-dots">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </div>
                    )}
                    endRef={chatEndRef}
                    composer={(
                        <div
                            className="figma-chat-input"
                            style={{ position: 'relative' }}
                            onDrop={handleDrop}
                            onDragOver={e => e.preventDefault()}
                        >
                            {(attachments.length > 0 || turnDanceSelections.length > 0) && (
                                <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap', borderBottom: '1px solid var(--figma-border)' }}>
                                    {turnDanceSelections.map((selection, idx) => (
                                        <div key={`${selection.scope}:${assetRefKey(selection.ref) || idx}`} className="turn-option-pill">
                                            <Zap size={10} style={{ marginRight: '4px' }} />
                                            <span>{selection.label}</span>
                                            <span className={`turn-option-pill__scope turn-option-pill__scope--${selection.scope}`}>
                                                {selection.scope}
                                            </span>
                                            <X
                                                size={10}
                                                style={{ marginLeft: '4px', cursor: 'pointer' }}
                                                onClick={() => setTurnDanceSelections((current) => current.filter((_, currentIndex) => currentIndex !== idx))}
                                            />
                                        </div>
                                    ))}
                                    {attachments.map((att, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', background: 'var(--figma-bg-hover)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>
                                            <FileIcon size={10} style={{ marginRight: '4px' }} />
                                            {att.name}
                                            <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {isMentioning && mentionResults.length > 0 ? (
                                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                    {mentionResults.map((file, i) => (
                                        <div
                                            key={file.absolute}
                                            className={`slash-menu-item mention-menu-item ${i === mentionIndex ? 'active' : ''}`}
                                            onClick={() => {
                                                const newText = extractMentionText();
                                                if (newText !== null) {
                                                    setInput(newText);
                                                    setAttachments(prev => [...prev, file]);
                                                }
                                                inputRef.current?.focus();
                                            }}
                                        >
                                            <MentionFileIcon path={file.path} />
                                            <span className="mention-result__content">
                                                <span className="mention-result__name">{file.name}</span>
                                                <span className="mention-result__path">{file.path}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {danceSlashMatch !== null ? (
                                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                    {danceSearchSections.length > 0 ? danceSearchSections.map((section) => (
                                        <div key={section.key} className="slash-menu__section">
                                            <div className="slash-menu__section-title">{section.title}</div>
                                            {section.items.map((item) => {
                                                const resultIndex = danceSearchResults.findIndex((candidate) => candidate.key === item.key);
                                                return (
                                                    <div
                                                        key={item.key}
                                                        className={`slash-menu-item dance-menu-item ${resultIndex === danceSearchIndex ? 'active' : ''}`}
                                                        onClick={() => addTurnDanceSelection(item)}
                                                    >
                                                        <span className={`dance-result__scope dance-result__scope--${item.scope}`}>{item.scope}</span>
                                                        <span className="mention-result__content">
                                                            <span className="mention-result__name">{item.label}</span>
                                                            <span className="mention-result__path">{item.subtitle}</span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )) : (
                                        <div className="slash-menu__section">
                                            <div className="slash-menu__section-title">Dance</div>
                                            <div className="slash-menu-item">
                                                <span className="slash-desc">No matching dances found.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {danceSlashMatch === null && showSlashMenu && filteredCommands.length > 0 ? (
                                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                    {filteredCommands.map((c, i) => (
                                        <div
                                            key={c.cmd}
                                            className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                                            onClick={() => {
                                                if (c.mode === 'compose') {
                                                    setInput(`${c.cmd} `);
                                                } else {
                                                    executeSlashCommand(id, c.cmd);
                                                    setInput('');
                                                }
                                                setShowSlashMenu(false);
                                            }}
                                        >
                                            <span className="slash-cmd">{c.cmd}</span>
                                            <span className="slash-desc">{c.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <div className="figma-chat-input__main">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => {
                                        handleInputChange(e.target.value);
                                        e.target.style.height = '0';
                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                        e.target.style.overflowY = e.target.scrollHeight > 102 ? 'auto' : 'hidden';
                                    }}
                                    onKeyUp={() => checkMention()}
                                    onMouseUp={() => checkMention()}
                                    onKeyDown={handleKeyDownWrapper}
                                    placeholder={!modelConfigured
                                        ? 'Select a model before chatting'
                                        : isPlanAgent
                                            ? 'Plan mode — ask for a plan...'
                                            : 'Message... (@ files, / to use dance for this turn)'}
                                    disabled={isLoading}
                                    rows={1}
                                    className="text-input"
                                />
                                {isLoading ? (
                                    <button
                                        className="figma-send-btn abort"
                                        onClick={() => abortChat(id)}
                                        title="Abort generation"
                                    >
                                        <Square size={12} fill="currentColor" />
                                    </button>
                                ) : (
                                    <button
                                        className="figma-send-btn"
                                        onClick={handleSend}
                                        disabled={!input.trim() || !modelConfigured || danceSlashMatch !== null}
                                    >
                                        <Send size={12} />
                                    </button>
                                )}
                            </div>
                            <div className="figma-chat-input__runtime-row">
                                <div className="figma-chat-input__mode-group">
                                    <button
                                        className={`mode-toggle ${!isPlanAgent ? 'is-active' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedAgentId !== 'build') setPerformerAgentId(id, 'build');
                                        }}
                                        title={buildAgent?.description || 'Build mode'}
                                        type="button"
                                    >
                                        <Hammer size={12} />
                                        <span>Build</span>
                                    </button>
                                    <button
                                        className={`mode-toggle mode-plan ${isPlanAgent ? 'is-active' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedAgentId !== 'plan') setPerformerAgentId(id, 'plan');
                                        }}
                                        title={planAgent?.description || 'Plan mode'}
                                        type="button"
                                    >
                                        <Lightbulb size={12} />
                                        <span>Plan</span>
                                    </button>
                                </div>
                                <ModelVariantSelect
                                    model={performer?.model || null}
                                    value={performer?.modelVariant || null}
                                    onChange={(value) => setPerformerModelVariant(id, value)}
                                    className="figma-chat-input__variant"
                                    compact
                                    titlePrefix="Performer variant"
                                />
                                <button
                                    className="mode-toggle mode-compact"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void summarizeSession(id);
                                    }}
                                    title="Compact this thread"
                                    type="button"
                                    disabled={!modelConfigured || isLoading}
                                >
                                    <Sparkles size={12} />
                                </button>
                            </div>
                        </div>
                    )}
                />
            )}
        </CanvasWindowFrame>
    );
}
