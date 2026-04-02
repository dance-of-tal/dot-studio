/**
 * AgentFrame — Canvas node representing a performer.
 *
 * This is a thin orchestrator that:
 * 1. Initializes shared hooks and store bindings
 * 2. Renders the CanvasWindowFrame shell with header
 * 3. Delegates to PerformerEditPanel or PerformerChatPanel
 * Edit-mode composition → PerformerEditPanel
 * Chat-mode conversation → PerformerChatPanel
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Handle, Position, useReactFlow } from '@xyflow/react'

import { useStudioStore } from '../../store'
import { useAgents, useAssetKind, useAssets, useMcpServers } from '../../hooks/queries'
import { hasModelConfig, resolvePerformerAgentId } from '../../lib/performers'
import { usePerformerPresentation } from '../../hooks/usePerformerPresentation'
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { getCanvasViewportSize, resolveFocusNodeId, scheduleFitView } from '../../lib/focus-utils'
import { assetUrnAuthor, assetUrnDisplayName, assetUrnPath } from '../../lib/asset-urn'
import type { AssetListItem } from '../../../shared/asset-contracts'
import type { AssetRef, ModelConfig } from '../../types'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'

import PerformerEditPanel from './PerformerEditPanel'
import PerformerChatPanel from './PerformerChatPanel'
import PerformerFrameHeaderMeta from './PerformerFrameHeaderMeta'
import { useChatSession } from '../../store/session/use-chat-session'

import { Pencil, EyeOff, Maximize2, Minimize2 } from 'lucide-react'
import './AgentFrame.css'
import './AgentChat.css'
import './AgentChatComposer.css'
import './AgentInput.css'

/* ── Main Component ── */

type AgentFrameData = {
    name: string
    width?: number
    height?: number
    model?: ModelConfig | null
    modelLabel?: string | null
    modelTitle?: string | null
    talLabel?: string | null
    danceSummary?: string | null
    agentId?: string | null
    planMode?: boolean
    actEditConnectVisible?: boolean
    actEditParticipant?: boolean
    actEditDimmed?: boolean
    transformActive?: boolean
    onActivateTransform?: (() => void) | undefined
    onDeactivateTransform?: (() => void) | undefined
}

type AgentFrameProps = {
    data: AgentFrameData
    id: string
}

export default function AgentFrame({ data, id }: AgentFrameProps) {
    // ─── Store ────────────────────────────────────────
    const {
        selectedPerformerId, focusedPerformerId, editingTarget,
        setPerformerAgentId,
        togglePerformerVisibility, closeEditor,
        performers, drafts,
        openDraftEditor,
        updatePerformerName,
        updatePerformerAuthoringMeta,
        setPerformerTalRef, setPerformerDanceDeliveryMode,
        setPerformerModel, setPerformerModelVariant,
        removePerformerMcp, setPerformerMcpBinding, removePerformerDance,
        enterFocusMode, exitFocusMode,
        focusSnapshot,
    } = useStudioStore()

    // ─── Local State ──────────────────────────────────
    const chatEndRef = useRef<HTMLDivElement>(null)
    const bodyRef = useRef<HTMLDivElement>(null)
    const { fitView: rfFitView } = useReactFlow()

    // ─── Derived ──────────────────────────────────────
    const isSelected = selectedPerformerId === id
    const focusNodeId = resolveFocusNodeId(focusSnapshot, focusedPerformerId)
    const isFocused = focusSnapshot?.type === 'performer' && focusNodeId === id
    const chatSession = useChatSession(id)
    const messages = chatSession.messages
    const isLoading = chatSession.isLoading
    const prefixCount = chatSession.prefixCount
    const modelConfigured = hasModelConfig(data.model)
    const isEditMode = editingTarget?.type === 'performer' && editingTarget.id === id
    const isActEditMode = !!data.actEditConnectVisible
    const shouldShowEditPanel = isEditMode || isActEditMode
    const performer = performers.find((item) => item.id === id) || null
    const sessionId = chatSession.sessionId
    const hasActiveSession = !!sessionId

    // ─── Queries ──────────────────────────────────────
    const { data: agents = [] } = useAgents(isSelected || shouldShowEditPanel)
    const { data: danceAssets = [] } = useAssetKind('dance', isSelected || isFocused || shouldShowEditPanel)
    const { data: assetInventory = [] } = useAssets(isSelected || shouldShowEditPanel)
    const { data: mcpServers = [] } = useMcpServers(isSelected || shouldShowEditPanel)

    // ─── DnD ──────────────────────────────────────────
    const talDrop = useDroppable({ id: `performer-edit-tal-${id}`, data: { performerId: id, type: 'tal' } })
    const danceDrop = useDroppable({ id: `performer-edit-dance-${id}`, data: { performerId: id, type: 'dance' } })
    const modelDrop = useDroppable({ id: `performer-edit-model-${id}`, data: { performerId: id, type: 'model' } })
    const mcpDrop = useDroppable({ id: `performer-edit-mcp-${id}`, data: { performerId: id, type: 'mcp' } })

    // ─── Agent/model resolution ───────────────────────
    const selectedAgentId = performer
        ? resolvePerformerAgentId(performer)
        : (data.agentId || (data.planMode ? 'plan' : 'build'))
    const buildAgent = useMemo(() => agents.find((a) => a.name === 'build') || null, [agents])
    const planAgent = useMemo(() => agents.find((a) => a.name === 'plan') || null, [agents])

    // ─── Presentation ─────────────────────────────────
    const { presentation: performerPresentation, runtimeTools } = usePerformerPresentation(
        performer, assetInventory, mcpServers, drafts,
        { enableTools: (isSelected || shouldShowEditPanel) },
    )
    // Standalone performers no longer have edges — relations live inside Acts only
    const requestRelations: Array<{ targetName: string; description: string }> = []
    const mcpBindingRows = useMemo(
        () => (performerPresentation.declaredMcpServerNames || []).map((placeholderName) => ({
            placeholderName,
            serverName: performer?.mcpBindingMap?.[placeholderName] || null,
        })),
        [performer?.mcpBindingMap, performerPresentation.declaredMcpServerNames],
    )
    const mcpBindingOptions = useMemo(
        () => mcpServers.map((server) => ({ name: server.name, disabled: false })),
        [mcpServers],
    )

    // ─── MCP binding auto-cleanup ─────────────────────
    useEffect(() => {
        if (!performer?.mcpBindingMap) return
        const validNames = new Set(mcpServers.map((s) => s.name))
        for (const [placeholderName, serverName] of Object.entries(performer.mcpBindingMap)) {
            if (!serverName || validNames.has(serverName)) continue
            setPerformerMcpBinding(id, placeholderName, null)
        }
    }, [id, mcpServers, performer?.mcpBindingMap, setPerformerMcpBinding])

    // ─── Wheel isolation ──────────────────────────────
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const handler = (e: WheelEvent) => { e.stopPropagation() }
        el.addEventListener('wheel', handler, { passive: true })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    // ─── Scroll on new messages ───────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading])

    const handleToggleFocus = useCallback(() => {
        if (isFocused) {
            exitFocusMode()
            scheduleFitView(rfFitView, 'exit')
            return
        }

        enterFocusMode(id, 'performer', getCanvasViewportSize())
    }, [enterFocusMode, exitFocusMode, id, isFocused, rfFitView])

    const openAssetEditor = useCallback(async (
        kind: 'tal' | 'dance',
        targetRef: AssetRef | null,
        _attachMode: 'tal' | 'dance-new' | 'dance-replace',
    ) => {
        if (!targetRef) return
        try {
            if (targetRef.kind === 'draft') {
                const draft = drafts[targetRef.draftId]
                if (!draft) throw new Error('Draft not found.')
                openDraftEditor(targetRef.draftId)
                return
            }
            const author = assetUrnAuthor(targetRef.urn)
            const path = assetUrnPath(targetRef.urn)
            const displayName = assetUrnDisplayName(targetRef.urn)
            if (!author || !path) throw new Error('Invalid asset reference.')
            let detail: AssetListItem
            try { detail = await api.assets.get(kind, author.replace(/^@/, ''), path) } catch { detail = await api.assets.getRegistry(kind, author.replace(/^@/, ''), path) }
            // For registry assets, we still open a new editor with the fetched content
            const { createMarkdownEditor } = useStudioStore.getState()
            createMarkdownEditor(kind, {
                source: { name: detail.name || displayName, slug: detail.slug || displayName, description: detail.description || detail.name || displayName, tags: Array.isArray(detail.tags) ? detail.tags : [], content: typeof detail.content === 'string' ? detail.content : '', derivedFrom: detail.urn || targetRef.urn || null },
                attachTarget: performer ? { performerId: performer.id, mode: _attachMode, targetRef } : undefined,
            })
        } catch (error) {
            console.error('Failed to open markdown editor', error)
            showToast(`Studio could not open the ${kind} editor for this performer.`, 'error', {
                title: `${kind === 'tal' ? 'Tal' : 'Dance'} editor failed`,
                dedupeKey: `performer-editor-open:${id}:${kind}:${targetRef?.kind}:${targetRef?.kind === 'registry' ? targetRef.urn : targetRef?.draftId}`,
                actionLabel: 'Retry',
                onAction: () => { void openAssetEditor(kind, targetRef, _attachMode) },
            })
        }
    }, [openDraftEditor, drafts, id, performer])

    // ─── Render ───────────────────────────────────────
    return (
        <div className={`performer-node-shell ${data.actEditParticipant ? 'performer-node-shell--act-participant' : ''} ${data.actEditDimmed ? 'performer-node-shell--act-dimmed' : ''}`}>
            {data.actEditConnectVisible ? (
                <>
                    <Handle id="top" type="source" position={Position.Top} className="performer-node-shell__handle" isConnectable />
                    <Handle id="right" type="source" position={Position.Right} className="performer-node-shell__handle" isConnectable />
                    <Handle id="bottom" type="source" position={Position.Bottom} className="performer-node-shell__handle" isConnectable />
                    <Handle id="left" type="source" position={Position.Left} className="performer-node-shell__handle" isConnectable />
                </>
            ) : null}
            <CanvasWindowFrame
                className={`nowheel ${isFocused ? 'canvas-frame--focused' : ''}`}
                width={data.width || 320}
                height={data.height || 400}
                transformActive={!!data.transformActive}
                onActivateTransform={data.onActivateTransform as (() => void) | undefined}
                onDeactivateTransform={data.onDeactivateTransform as (() => void) | undefined}
                selected={isSelected}
                focused={isFocused}
                minWidth={280}
                minHeight={320}
                headerStart={<span className="canvas-frame__name">{data.name}</span>}
                headerEnd={(
                    <div className="canvas-frame__header-actions">
                        {!isFocused && (
                            <PerformerFrameHeaderMeta
                                modelLabel={data.modelLabel || null}
                                modelTitle={data.modelTitle || null}
                                talLabel={data.talLabel || null}
                                danceSummary={data.danceSummary || null}
                            />
                        )}
                        <button
                            className={`icon-btn ${isFocused ? 'icon-btn--active' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleToggleFocus()
                            }}
                            title={isFocused ? 'Exit focus mode' : 'Focus mode'}
                            style={{ padding: '0 4px', opacity: 0.7 }}
                        >
                            {isFocused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                        </button>
                        {!isFocused && !shouldShowEditPanel && (
                            <button
                                className="icon-btn"
                                onClick={(e) => { e.stopPropagation(); useStudioStore.getState().openPerformerEditor(id) }}
                                title="Edit performer"
                                style={{ padding: '0 4px', opacity: 0.7 }}
                            >
                                <Pencil size={11} />
                            </button>
                        )}
                        {!isFocused && (
                            <button
                                className="icon-btn"
                                onClick={(e) => { e.stopPropagation(); togglePerformerVisibility(id) }}
                                title="Hide from Canvas"
                                style={{ padding: '0 4px', opacity: 0.7 }}
                            >
                                <EyeOff size={11} />
                            </button>
                        )}
                    </div>
                )}
                bodyClassName="nowheel nodrag"
                bodyRef={bodyRef}
            >
                {shouldShowEditPanel ? (
                    <PerformerEditPanel
                        performerId={id}
                        performer={performer}
                        hideBackButton={isActEditMode}
                        presentation={performerPresentation}
                        runtimeTools={runtimeTools || null}
                        requestRelations={requestRelations}
                        mcpBindingRows={mcpBindingRows}
                        mcpBindingOptions={mcpBindingOptions}
                        dropRefs={{
                            tal: { isOver: talDrop.isOver, setNodeRef: talDrop.setNodeRef },
                            dance: { isOver: danceDrop.isOver, setNodeRef: danceDrop.setNodeRef },
                            model: { isOver: modelDrop.isOver, setNodeRef: modelDrop.setNodeRef },
                            mcp: { isOver: mcpDrop.isOver, setNodeRef: mcpDrop.setNodeRef },
                        }}
                        onClose={closeEditor}
                        onNameChange={(value) => updatePerformerName(id, value)}
                        onDescriptionChange={(value) => updatePerformerAuthoringMeta(id, { description: value })}
                        onTalRefChange={(ref) => setPerformerTalRef(id, ref)}
                        onDanceDeliveryModeChange={(value) => setPerformerDanceDeliveryMode(id, value)}
                        onModelChange={(model) => setPerformerModel(id, model)}
                        onModelVariantChange={(variant) => setPerformerModelVariant(id, variant)}
                        onRemoveDance={removePerformerDance}
                        onRemoveMcp={removePerformerMcp}
                        onSetMcpBinding={setPerformerMcpBinding}

                        onOpenAssetEditor={openAssetEditor}
                    />
                ) : (
                    <PerformerChatPanel
                        performerId={id}
                        performer={performer}
                        messages={messages}
                        prefixCount={prefixCount}
                        isLoading={isLoading}
                        sessionId={sessionId}
                        hasActiveSession={hasActiveSession}
                        modelConfigured={modelConfigured}
                        selectedAgentId={selectedAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        runtimeTools={runtimeTools || null}
                        danceAssets={danceAssets}
                        drafts={drafts}
                        chatEndRef={chatEndRef}
                        onSetAgentId={setPerformerAgentId}
                        onSetModelVariant={setPerformerModelVariant}
                    />
                )}
            </CanvasWindowFrame>
        </div>
    )
}
