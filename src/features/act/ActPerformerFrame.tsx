/**
 * ActPerformerFrame — Canvas node for an Act performer in Act edit focus mode.
 *
 * Unlike the standalone AgentFrame, this always renders in "edit mode"
 * using PerformerEditPanel. It adapts ActPerformer data to the PerformerNode
 * shape that PerformerEditPanel expects.
 */
import { useMemo, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useDroppable } from '@dnd-kit/core'
import { Trash2 } from 'lucide-react'

import { useStudioStore } from '../../store'
import { useAssets, useMcpServers } from '../../hooks/queries'
import { usePerformerPresentation } from '../../hooks/usePerformerPresentation'
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import PerformerEditPanel from '../performer/PerformerEditPanel'
import type { PerformerNode, AssetRef, DanceDeliveryMode, ModelConfig } from '../../types'

import './ActPerformerFrame.css'

export const ACT_PERFORMER_WIDTH = 340
export const ACT_PERFORMER_HEIGHT = 480

export default function ActPerformerFrame({ id, data: _data }: any) {
    const {
        acts,
        editingActId,
        selectedActPerformerKey,
        updateActPerformer,
        removePerformerFromAct,
        selectActPerformer,
        drafts,
        createMarkdownEditor,
    } = useStudioStore()

    const performerKey = id.replace(/^act-p-/, '')
    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const actPerformer = act ? act.performers[performerKey] : null

    // Queries — activate when selected
    const isSelected = selectedActPerformerKey === performerKey
    const { data: assetInventory = [] } = useAssets(isSelected)
    const { data: mcpServers = [] } = useMcpServers(isSelected)

    // DnD zones
    const talDrop = useDroppable({ id: `act-perf-tal-${id}`, data: { performerId: id, type: 'tal' } })
    const danceDrop = useDroppable({ id: `act-perf-dance-${id}`, data: { performerId: id, type: 'dance' } })
    const modelDrop = useDroppable({ id: `act-perf-model-${id}`, data: { performerId: id, type: 'model' } })
    const mcpDrop = useDroppable({ id: `act-perf-mcp-${id}`, data: { performerId: id, type: 'mcp' } })

    // Adapt ActPerformer → PerformerNode shape for PerformerEditPanel
    const asPerformerNode: PerformerNode | null = useMemo(() => {
        if (!actPerformer) return null
        return {
            id: performerKey,
            name: actPerformer.name,
            position: actPerformer.position,
            scope: 'shared',
            model: actPerformer.model,
            modelPlaceholder: null,
            modelVariant: actPerformer.modelVariant,
            agentId: actPerformer.agentId,
            talRef: actPerformer.talRef,
            danceRefs: actPerformer.danceRefs,
            mcpServerNames: actPerformer.mcpServerNames,
            mcpBindingMap: actPerformer.mcpBindingMap as Record<string, string>,
            danceDeliveryMode: actPerformer.danceDeliveryMode,
            executionMode: 'direct',
            planMode: actPerformer.planMode,
        }
    }, [actPerformer, performerKey])

    // Presentation layer
    const { presentation: performerPresentation, runtimeTools } = usePerformerPresentation(
        asPerformerNode, assetInventory, mcpServers, drafts,
        { enableTools: isSelected },
    )

    const mcpBindingRows = useMemo(
        () => (performerPresentation.declaredMcpServerNames || []).map((placeholderName) => ({
            placeholderName,
            serverName: actPerformer?.mcpBindingMap?.[placeholderName] || null,
        })),
        [actPerformer?.mcpBindingMap, performerPresentation.declaredMcpServerNames],
    )
    const mcpBindingOptions = useMemo(
        () => mcpServers.map((server) => ({ name: server.name, disabled: server.enabled === false })),
        [mcpServers],
    )

    // Callbacks — proxy edits to Act store
    const handleNameChange = useCallback((value: string) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { name: value })
    }, [editingActId, performerKey, updateActPerformer])

    const handleTalRefChange = useCallback((ref: AssetRef | null) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { talRef: ref })
    }, [editingActId, performerKey, updateActPerformer])

    const handleDanceDeliveryModeChange = useCallback((value: DanceDeliveryMode) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { danceDeliveryMode: value })
    }, [editingActId, performerKey, updateActPerformer])

    const handleModelChange = useCallback((model: ModelConfig | null) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { model })
    }, [editingActId, performerKey, updateActPerformer])

    const handleModelVariantChange = useCallback((variant: string | null) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { modelVariant: variant })
    }, [editingActId, performerKey, updateActPerformer])

    const handleAgentIdChange = useCallback((agentId: string | null) => {
        if (!editingActId) return
        updateActPerformer(editingActId, performerKey, { agentId })
    }, [editingActId, performerKey, updateActPerformer])

    const handleRemoveDance = useCallback((_id: string, key: string) => {
        if (!editingActId || !actPerformer) return
        const newRefs = actPerformer.danceRefs.filter(
            (ref, i) => (ref.kind === 'draft' ? ref.draftId !== key : `${ref.urn}:${i}` !== key && ref.urn !== key)
        )
        updateActPerformer(editingActId, performerKey, { danceRefs: newRefs })
    }, [editingActId, performerKey, actPerformer, updateActPerformer])

    const handleRemoveMcp = useCallback((_id: string, serverName: string) => {
        if (!editingActId || !actPerformer) return
        updateActPerformer(editingActId, performerKey, {
            mcpServerNames: actPerformer.mcpServerNames.filter((n) => n !== serverName),
        })
    }, [editingActId, performerKey, actPerformer, updateActPerformer])

    const handleSetMcpBinding = useCallback((_id: string, placeholderName: string, serverName: string | null) => {
        if (!editingActId || !actPerformer) return
        updateActPerformer(editingActId, performerKey, {
            mcpBindingMap: { ...actPerformer.mcpBindingMap, [placeholderName]: serverName },
        })
    }, [editingActId, performerKey, actPerformer, updateActPerformer])

    const openAssetEditor = useCallback(async (
        kind: 'tal' | 'dance',
        targetRef: any,
        attachMode: 'tal' | 'dance-new' | 'dance-replace',
    ) => {
        try {
            if (!targetRef) {
                createMarkdownEditor(kind, {
                    attachTarget: asPerformerNode ? { performerId: asPerformerNode.id, mode: attachMode, targetRef: attachMode === 'dance-replace' ? null : undefined } : undefined,
                })
                return
            }
            if (targetRef.kind === 'draft') {
                const draft = drafts[targetRef.draftId]
                if (!draft) throw new Error('Draft not found.')
                createMarkdownEditor(kind, {
                    source: { name: draft.name, slug: draft.slug, description: draft.description, tags: draft.tags, content: typeof draft.content === 'string' ? draft.content : '', derivedFrom: draft.derivedFrom || null },
                    attachTarget: asPerformerNode ? { performerId: asPerformerNode.id, mode: attachMode, targetRef } : undefined,
                })
                return
            }
            const [, author, name] = String(targetRef.urn || '').split('/')
            if (!author || !name) throw new Error('Invalid asset reference.')
            let detail: any
            try { detail = await api.assets.get(kind, author.replace(/^@/, ''), name) } catch { detail = await api.assets.getRegistry(kind, author.replace(/^@/, ''), name) }
            createMarkdownEditor(kind, {
                source: { name: detail.name || name, slug: detail.slug || name, description: detail.description || detail.name || name, tags: Array.isArray(detail.tags) ? detail.tags : [], content: typeof detail.content === 'string' ? detail.content : '', derivedFrom: detail.urn || targetRef.urn || null },
                attachTarget: asPerformerNode ? { performerId: asPerformerNode.id, mode: attachMode, targetRef } : undefined,
            })
        } catch (error) {
            console.error('Failed to open markdown editor', error)
            showToast(`Studio could not open the ${kind} editor.`, 'error', {
                title: `${kind === 'tal' ? 'Tal' : 'Dance'} editor failed`,
                dedupeKey: `act-perf-editor:${performerKey}:${kind}`,
            })
        }
    }, [createMarkdownEditor, drafts, asPerformerNode, performerKey])

    if (!act || !actPerformer || !editingActId) return null

    return (
        <div className="act-performer-node">
            <Handle type="target" position={Position.Left} className="act-performer-node__handle" />
            <Handle type="source" position={Position.Right} className="act-performer-node__handle" />
            <CanvasWindowFrame
                className="act-performer-node__frame nowheel"
                width={ACT_PERFORMER_WIDTH}
                height={ACT_PERFORMER_HEIGHT}
                selected={isSelected}
                minWidth={300}
                minHeight={380}
                headerStart={<span className="canvas-frame__name">{actPerformer.name}</span>}
                headerEnd={(
                    <div className="canvas-frame__header-actions">
                        <button
                            className="icon-btn"
                            title="Remove from Act"
                            onClick={(e) => {
                                e.stopPropagation()
                                removePerformerFromAct(editingActId, performerKey)
                            }}
                            style={{ padding: '0 4px', opacity: 0.7 }}
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                )}
                bodyClassName="nowheel nodrag"
            >
                <PerformerEditPanel
                    performerId={performerKey}
                    performer={asPerformerNode}
                    presentation={performerPresentation}
                    runtimeTools={runtimeTools || null}
                    selectedAgent={null}
                    requestRelations={[]}
                    mcpBindingRows={mcpBindingRows}
                    mcpBindingOptions={mcpBindingOptions}
                    dropRefs={{
                        tal: { isOver: talDrop.isOver, setNodeRef: talDrop.setNodeRef },
                        dance: { isOver: danceDrop.isOver, setNodeRef: danceDrop.setNodeRef },
                        model: { isOver: modelDrop.isOver, setNodeRef: modelDrop.setNodeRef },
                        mcp: { isOver: mcpDrop.isOver, setNodeRef: mcpDrop.setNodeRef },
                    }}
                    onClose={() => selectActPerformer(null)}
                    hideBackButton
                    onNameChange={handleNameChange}
                    onTalRefChange={handleTalRefChange}
                    onDanceDeliveryModeChange={handleDanceDeliveryModeChange}
                    onModelChange={handleModelChange}
                    onModelVariantChange={handleModelVariantChange}
                    onAgentIdChange={handleAgentIdChange}
                    onRemoveDance={handleRemoveDance}
                    onRemoveMcp={handleRemoveMcp}
                    onSetMcpBinding={handleSetMcpBinding}
                    onOpenAssetEditor={openAssetEditor}
                />
            </CanvasWindowFrame>
        </div>
    )
}
