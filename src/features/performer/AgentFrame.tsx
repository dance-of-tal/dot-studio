/**
 * AgentFrame — Canvas node representing a performer.
 *
 * This is a thin orchestrator that:
 * 1. Initializes shared hooks and store bindings
 * 2. Renders the CanvasWindowFrame shell with header
 * 3. Delegates to PerformerEditPanel or PerformerChatPanel
 * 4. Manages SafeReviewModal
 *
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
import { scheduleFitView } from '../../lib/focus-utils'
import { assetUrnAuthor, assetUrnDisplayName, assetUrnPath } from '../../lib/asset-urn'
import type { AssetListItem } from '../../../shared/asset-contracts'
import type { AssetRef, ModelConfig } from '../../types'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import SafeReviewModal from '../../components/modals/SafeReviewModal'

import PerformerEditPanel from './PerformerEditPanel'
import PerformerChatPanel from './PerformerChatPanel'
import PerformerFrameHeaderMeta from './PerformerFrameHeaderMeta'
import { usePerformerSafeReview } from './usePerformerSafeReview'

import { Pencil, EyeOff, Maximize2, Minimize2, Shield } from 'lucide-react'
import './AgentFrame.css'
import './AgentChat.css'
import './AgentChatComposer.css'
import './MarkdownRenderer.css'
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
        chats, chatPrefixes, loadingPerformerId, setPerformerAgentId,
        togglePerformerVisibility, closeEditor,
        performers, drafts,
        openDraftEditor,
        updatePerformerName,
        setPerformerTalRef, setPerformerDanceDeliveryMode,
        setPerformerModel, setPerformerModelVariant,
        removePerformerMcp, setPerformerMcpBinding, removePerformerDance,
        setPerformerExecutionMode,
        sessionMap, safeSummaries,
        refreshSafeOwner, applySafeOwner, discardSafeOwnerFile,
        discardAllSafeOwner, undoLastSafeApply,
        detachPerformerSession,
        enterFocusMode, exitFocusMode,
    } = useStudioStore()

    // ─── Local State ──────────────────────────────────
    const chatEndRef = useRef<HTMLDivElement>(null)
    const bodyRef = useRef<HTMLDivElement>(null)
    const { fitView: rfFitView } = useReactFlow()

    // ─── Derived ──────────────────────────────────────
    const isSelected = selectedPerformerId === id
    const isFocused = focusedPerformerId === id
    const isLoading = loadingPerformerId === id
    const messages = useMemo(() => chats[id] || [], [chats, id])
    const prefixCount = useMemo(() => (chatPrefixes[id] || []).length, [chatPrefixes, id])
    const modelConfigured = hasModelConfig(data.model)
    const isEditMode = editingTarget?.type === 'performer' && editingTarget.id === id
    const isActEditMode = !!data.actEditConnectVisible
    const shouldShowEditPanel = isEditMode || isActEditMode
    const performer = performers.find((item) => item.id === id) || null
    const safeSummary = safeSummaries[`performer:${id}`] || null
    const sessionId = sessionMap[id] || null
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
        () => mcpServers.map((server) => ({ name: server.name, disabled: server.enabled === false })),
        [mcpServers],
    )

    // ─── MCP binding auto-cleanup ─────────────────────
    useEffect(() => {
        if (!performer?.mcpBindingMap) return
        const validNames = new Set(mcpServers.filter((s) => s.enabled !== false).map((s) => s.name))
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

    const {
        showSafeReview,
        safeBusy,
        pendingModeSwitch,
        pendingSafeModeConfirm,
        setShowSafeReview,
        setPendingModeSwitch,
        handleToggleExecutionMode,
        confirmSafeModeSwitch,
        cancelSafeModeSwitch,
        switchNotice,
        applySafeReview,
        discardSafeReviewAll,
        discardSafeReviewFile,
        undoSafeReviewApply,
    } = usePerformerSafeReview({
        performerId: id,
        performer,
        isSelected,
        isFocused,
        isEditMode: shouldShowEditPanel,
        refreshSafeOwner,
        safeSummary,
        setPerformerExecutionMode,
        detachPerformerSession,
        applySafeOwner,
        discardSafeOwnerFile,
        discardAllSafeOwner,
        undoLastSafeApply,
    })

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
                    <Handle type="target" position={Position.Left} className="performer-node-shell__handle" />
                    <Handle type="source" position={Position.Right} className="performer-node-shell__handle" />
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
                minWidth={280}
                minHeight={320}
                headerStart={<span className="canvas-frame__name">{data.name}</span>}
                headerEnd={(
                    <div className="canvas-frame__header-actions">
                        <PerformerFrameHeaderMeta
                            modelLabel={data.modelLabel || null}
                            modelTitle={data.modelTitle || null}
                            talLabel={data.talLabel || null}
                            danceSummary={data.danceSummary || null}
                            executionMode={performer?.executionMode === 'safe' ? 'safe' : 'direct'}
                            pendingCount={safeSummary?.pendingCount || 0}
                            conflictCount={safeSummary?.conflictCount || 0}
                        />
                        <button
                            className={`icon-btn ${isFocused ? 'icon-btn--active' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (isFocused) {
                                    exitFocusMode()
                                    scheduleFitView(rfFitView, 'exit')
                                } else {
                                    const canvasEl = document.querySelector('.canvas-area')
                                    const rect = canvasEl?.getBoundingClientRect()
                                    enterFocusMode(id, 'performer', {
                                        width: rect?.width ?? 1200,
                                        height: rect?.height ?? 800,
                                    })
                                    scheduleFitView(rfFitView, 'enter')
                                }
                            }}
                            title={isFocused ? 'Exit focus mode' : 'Focus mode'}
                            style={{ padding: '0 4px', opacity: 0.7 }}
                        >
                            {isFocused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                        </button>
                        {!shouldShowEditPanel && (
                            <button
                                className="icon-btn"
                                onClick={(e) => { e.stopPropagation(); useStudioStore.getState().openPerformerEditor(id) }}
                                title="Edit performer"
                                style={{ padding: '0 4px', opacity: 0.7 }}
                            >
                                <Pencil size={11} />
                            </button>
                        )}
                        <button
                            className="icon-btn"
                            onClick={(e) => { e.stopPropagation(); togglePerformerVisibility(id) }}
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
                {shouldShowEditPanel ? (
                    <PerformerEditPanel
                        performerId={id}
                        performer={performer}
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
                        onSetExecutionMode={handleToggleExecutionMode}

                        safeSummary={safeSummary}
                    />
                )}
            </CanvasWindowFrame>
            {showSafeReview ? (
                <SafeReviewModal
                    title={pendingModeSwitch === 'direct' ? `${data.name} · Review before switching to Direct` : `${data.name} · Safe Mode Review`}
                    summary={safeSummary}
                    busy={safeBusy}
                    onClose={() => { setShowSafeReview(false); setPendingModeSwitch(null) }}
                    onApply={() => { void applySafeReview() }}
                    onDiscardAll={() => { void discardSafeReviewAll() }}
                    onDiscardFile={(filePath) => {
                        void discardSafeReviewFile(filePath)
                    }}
                    onUndoLastApply={() => {
                        void undoSafeReviewApply()
                    }}
                    switchNotice={switchNotice}
                />
            ) : null}
            {pendingSafeModeConfirm ? (
                <div className="publish-modal__backdrop" onClick={cancelSafeModeSwitch}>
                    <div className="publish-modal safe-mode-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="publish-modal__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Shield size={16} />
                                <h3 style={{ margin: 0 }}>Switch to Safe Mode?</h3>
                            </div>
                        </div>
                        <div className="publish-modal__body">
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-base)', lineHeight: 1.5 }}>
                                Switching to Safe mode will start a new session in an isolated workspace.
                                Your current chat context will not carry over to the new session.
                            </p>
                        </div>
                        <div className="publish-modal__footer">
                            <button
                                type="button"
                                className="publish-modal__action publish-modal__action--primary"
                                onClick={confirmSafeModeSwitch}
                            >
                                <Shield size={12} />
                                <span>Switch to Safe</span>
                            </button>
                            <button
                                type="button"
                                className="publish-modal__action"
                                onClick={cancelSafeModeSwitch}
                            >
                                <span>Cancel</span>
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
