/**
 * PerformerEditPanel — Unified edit panel for performer configuration.
 * Shared between standalone AgentFrame and an Act's participant editor.
 *
 * Drill-down pattern:
 *   Main view: Compose cards (DnD + "Drag & drop or click to configure")
 *   Click a card → detail view for that category (Tal, Dances, Model, MCP)
 *   Back button returns to main card view.
 */
import { useState } from 'react'
import { ArrowLeft, ChevronLeft, Cpu, Hexagon, Server, Zap } from 'lucide-react'

import { unresolvedDeclaredMcpServerNames } from '../../lib/performers'
import type { PerformerNode, ModelConfig, AssetRef, DanceDeliveryMode, McpServer } from '../../types'

import PerformerComposeCards from './PerformerComposeCards'
import {
    PerformerDancesDetail,
    PerformerMcpDetail,
    PerformerModelDetail,
    PerformerTalDetail,
} from './performer-edit-sections'

type DetailView = 'tal' | 'dances' | 'model' | 'mcp' | null

type PerformerEditPanelProps = {
    performerId: string
    performer: PerformerNode | null
    presentation: {
        talAsset: { urn: string; name: string; description?: string } | null
        danceAssets: Array<{ urn: string; name: string; description?: string }>
        mcpServers: McpServer[]
        mcpPlaceholders: string[]
        declaredMcpServerNames?: string[]
    }
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    requestRelations: Array<{ targetName: string; description?: string | undefined }>
    mcpBindingRows: Array<{ placeholderName: string; serverName: string | null }>
    mcpBindingOptions: Array<{ name: string; disabled: boolean }>
    dropRefs: {
        tal: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        dance: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        model: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        mcp: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
    }
    /** Hide the back/close button (used in Act participant editing) */
    hideBackButton?: boolean
    onClose: () => void
    onNameChange: (value: string) => void
    onTalRefChange: (ref: AssetRef | null) => void
    onDanceDeliveryModeChange: (value: DanceDeliveryMode) => void
    onModelChange: (model: ModelConfig | null) => void
    onModelVariantChange: (variant: string | null) => void
    onRemoveDance: (id: string, key: string) => void
    onRemoveMcp: (id: string, serverName: string) => void
    onSetMcpBinding: (id: string, placeholderName: string, serverName: string | null) => void

    onOpenAssetEditor: (kind: 'tal' | 'dance', targetRef: AssetRef | null, attachMode: 'tal' | 'dance-new' | 'dance-replace') => void
}

export default function PerformerEditPanel({
    performerId,
    performer,
    presentation,
    runtimeTools,
    requestRelations,
    mcpBindingRows,
    mcpBindingOptions,
    dropRefs,
    hideBackButton,
    onClose,
    onNameChange,
    onTalRefChange,
    onDanceDeliveryModeChange,
    onModelChange,
    onModelVariantChange,
    onRemoveDance,
    onRemoveMcp,
    onSetMcpBinding,

    onOpenAssetEditor,
}: PerformerEditPanelProps) {
    const [detailView, setDetailView] = useState<DetailView>(null)
    const unresolvedMcpPlaceholders = performer ? unresolvedDeclaredMcpServerNames(performer) : []

    // ── Detail view titles ──
    const detailTitles: Record<string, string> = {
        tal: 'Tal',
        dances: 'Dances',
        model: 'Model & Runtime',
        mcp: 'MCP & Relations',
    }

    // ── Compose card descriptions (with counts) ──
    const talDesc = presentation.talAsset ? presentation.talAsset.name : 'Drag & drop or click to add'
    const danceDesc = presentation.danceAssets.length > 0
        ? `${presentation.danceAssets.length} dance${presentation.danceAssets.length !== 1 ? 's' : ''}`
        : 'Drag & drop or click to add'
    const modelDesc = performer?.model
        ? `${performer.model.modelId}`
        : 'Drag & drop or click to select'
    const mcpDesc = presentation.mcpServers.length > 0
        ? `${presentation.mcpServers.length} server${presentation.mcpServers.length !== 1 ? 's' : ''}`
        : 'Drag & drop or click to add'

    return (
        <>
            {/* ── Header ── */}
            {(detailView || !hideBackButton) && (
            <div className="edit-workbench__header">
                {detailView ? (
                    <button
                        className="edit-workbench__back"
                        onClick={(event) => {
                            event.stopPropagation()
                            setDetailView(null)
                        }}
                        title="Back to overview"
                    >
                        <ChevronLeft size={12} />
                    </button>
                ) : (
                    <button
                        className="edit-workbench__back"
                        onClick={(event) => {
                            event.stopPropagation()
                            onClose()
                        }}
                        title="Back to chat"
                    >
                        <ArrowLeft size={12} />
                    </button>
                )}
                <span className="section-title">
                    {detailView
                        ? detailTitles[detailView]
                        : 'Back to Chat'}
                </span>
            </div>
            )}

            {/* ── Name (always visible in both views) ── */}
            {!detailView && (
                <div className="adv-section">
                    <div className="adv-section__body">
                        <label className="adv-field">
                            <span className="adv-field__label">Name</span>
                            <input
                                className="text-input nodrag nowheel"
                                value={performer?.name || ''}
                                onChange={(event) => onNameChange(event.target.value)}
                            />
                        </label>
                    </div>
                </div>
            )}

            {/* ── Main View: Compose Cards ── */}
            {!detailView && (
                <>
                    <PerformerComposeCards
                        cards={[
                            {
                                key: 'tal',
                                title: 'Tal',
                                description: talDesc,
                                icon: <Hexagon size={12} />,
                                isOver: dropRefs.tal.isOver,
                                setNodeRef: dropRefs.tal.setNodeRef,
                                onClick: () => setDetailView('tal'),
                            },
                            {
                                key: 'dances',
                                title: 'Dances',
                                description: danceDesc,
                                icon: <Zap size={12} />,
                                isOver: dropRefs.dance.isOver,
                                setNodeRef: dropRefs.dance.setNodeRef,
                                onClick: () => setDetailView('dances'),
                            },
                            {
                                key: 'model',
                                title: 'Model',
                                description: modelDesc,
                                icon: <Cpu size={12} />,
                                isOver: dropRefs.model.isOver,
                                setNodeRef: dropRefs.model.setNodeRef,
                                onClick: () => setDetailView('model'),
                            },
                            {
                                key: 'mcp',
                                title: 'MCP',
                                description: mcpDesc,
                                icon: <Server size={12} />,
                                isOver: dropRefs.mcp.isOver,
                                setNodeRef: dropRefs.mcp.setNodeRef,
                                onClick: () => setDetailView('mcp'),
                            },
                        ]}
                    />
                </>
            )}

            {/* ── Detail Views ── */}
            {detailView === 'tal' && (
                <PerformerTalDetail
                    performer={performer}
                    talAsset={presentation.talAsset}
                    onOpenAssetEditor={onOpenAssetEditor}
                    onTalRefChange={onTalRefChange}
                />
            )}
            {detailView === 'dances' && (
                <PerformerDancesDetail
                    performer={performer}
                    performerId={performerId}
                    onOpenAssetEditor={onOpenAssetEditor}
                    onRemoveDance={onRemoveDance}
                    onDanceDeliveryModeChange={onDanceDeliveryModeChange}
                />
            )}
            {detailView === 'model' && (
                <PerformerModelDetail
                    performer={performer}
                    runtimeTools={runtimeTools}
                    onModelChange={onModelChange}
                    onModelVariantChange={onModelVariantChange}
                />
            )}
            {detailView === 'mcp' && (
                <PerformerMcpDetail
                    performer={performer}
                    performerId={performerId}
                    unresolvedMcpPlaceholders={unresolvedMcpPlaceholders}
                    mcpBindingRows={mcpBindingRows}
                    mcpBindingOptions={mcpBindingOptions}
                    requestRelations={requestRelations}
                    onRemoveMcp={onRemoveMcp}
                    onSetMcpBinding={onSetMcpBinding}
                />
            )}

        </>
    )
}
