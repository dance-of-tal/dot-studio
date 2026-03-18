/**
 * PerformerEditPanel — Unified edit panel for performer configuration.
 * Shared between standalone AgentFrame and Act's ActParticipantFrame.
 *
 * Drill-down pattern:
 *   Main view: Compose cards (DnD + "Drag & drop or click to configure")
 *   Click a card → detail view for that category (Tal, Dances, Model, MCP)
 *   Back button returns to main card view.
 */
import { useState } from 'react'
import { ArrowLeft, Hexagon, Zap, Cpu, Server, Pencil, X, ChevronLeft } from 'lucide-react'

import { unresolvedDeclaredMcpServerNames } from '../../lib/performers'
import type { PerformerNode, ModelConfig, AssetRef, DanceDeliveryMode } from '../../types'

import PerformerComposeCards from './PerformerComposeCards'
import ModelVariantSelect from './ModelVariantSelect'

type DetailView = 'tal' | 'dances' | 'model' | 'mcp' | null

type PerformerEditPanelProps = {
    performerId: string
    performer: PerformerNode | null
    presentation: {
        talAsset: { urn: string; name: string; description?: string } | null
        danceAssets: Array<{ urn: string; name: string; description?: string }>
        mcpServers: Array<{ name: string; status: string; tools: any[] }>
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
    /** Hide the back/close button (used in Act performer editing) */
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

    onOpenAssetEditor: (kind: 'tal' | 'dance', targetRef: any, attachMode: 'tal' | 'dance-new' | 'dance-replace') => void
}

function assetRefLabel(ref: AssetRef) {
    return ref.kind === 'draft'
        ? `Draft ${ref.draftId.slice(0, 8)}`
        : ref.urn.split('/').pop() || ref.urn
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

    // ── Detail Views ──────────────────────────────────────

    const renderTalDetail = () => (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Tal</span>
                    <button type="button" className="btn btn--sm" onClick={() => void onOpenAssetEditor('tal', performer?.talRef || null, 'tal')}>
                        {performer?.talRef ? 'Edit' : '+ New'}
                    </button>
                </div>
                <div className="adv-section__body">
                    {presentation.talAsset ? (
                        <div className="adv-list">
                            <div className="adv-list__item">
                                <Hexagon size={10} className="adv-list__icon" />
                                <span className="adv-list__label">{presentation.talAsset.name}</span>
                                {presentation.talAsset.description && (
                                    <span className="adv-section__summary">{presentation.talAsset.description}</span>
                                )}
                                <div className="adv-list__actions">
                                    <button type="button" className="icon-btn" onClick={() => void onOpenAssetEditor('tal', performer?.talRef || null, 'tal')} title="Edit tal">
                                        <Pencil size={10} />
                                    </button>
                                    <button type="button" className="icon-btn" onClick={() => onTalRefChange(null)} title="Remove tal">
                                        <X size={10} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <span className="adv-section__summary">No Tal connected. Drag & drop from Asset Library or click "+ New".</span>
                    )}
                </div>
            </div>
        </div>
    )

    const renderDancesDetail = () => (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Dances</span>
                    <button type="button" className="btn btn--sm" onClick={() => void onOpenAssetEditor('dance', null, 'dance-new')}>
                        + New
                    </button>
                </div>
                <div className="adv-section__body">
                    {performer?.danceRefs?.length ? (
                        <div className="adv-list">
                            {performer.danceRefs.map((ref) => (
                                <div key={`${ref.kind}-${ref.kind === 'draft' ? ref.draftId : ref.urn}`} className="adv-list__item">
                                    <Zap size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{assetRefLabel(ref)}</span>
                                    <div className="adv-list__actions">
                                        <button type="button" className="icon-btn" onClick={() => void onOpenAssetEditor('dance', ref, 'dance-replace')} title="Edit dance">
                                            <Pencil size={10} />
                                        </button>
                                        <button type="button" className="icon-btn" onClick={() => onRemoveDance(performerId, ref.kind === 'draft' ? ref.draftId : ref.urn)} title="Remove dance">
                                            <X size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="adv-section__summary">No dances connected. Drag & drop from Asset Library or click "+ New".</span>
                    )}
                </div>
            </div>
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Delivery Mode</span>
                </div>
                <div className="adv-section__body">
                    <label className="adv-field">
                        <select
                            className="select nodrag nowheel"
                            value={performer?.danceDeliveryMode || 'auto'}
                            onChange={(event) => onDanceDeliveryModeChange(event.target.value as DanceDeliveryMode)}
                        >
                            <option value="auto">Auto</option>
                            <option value="inject">Inject</option>
                            <option value="tool">Tool</option>
                        </select>
                    </label>
                </div>
            </div>
        </div>
    )

    const renderModelDetail = () => (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Model</span>
                    {performer?.model && (
                        <button type="button" className="btn btn--sm" onClick={() => onModelChange(null)}>
                            Clear
                        </button>
                    )}
                </div>
                <div className="adv-section__body">
                    <span className="adv-section__summary">
                        {performer?.model
                            ? `${performer.model.provider} / ${performer.model.modelId}`
                            : performer?.modelPlaceholder
                                ? `${performer.modelPlaceholder.provider} / ${performer.modelPlaceholder.modelId} (placeholder)`
                                : 'No model selected'}
                    </span>
                </div>
            </div>
            {performer?.model && (
                <>
                    <div className="adv-section">
                        <div className="adv-section__head">
                            <span className="section-title">Variant</span>
                        </div>
                        <div className="adv-section__body">
                            <ModelVariantSelect
                                model={performer.model}
                                value={performer.modelVariant || null}
                                onChange={onModelVariantChange}
                                titlePrefix="Performer variant"
                            />
                        </div>
                    </div>
                </>
            )}
            {runtimeTools && runtimeTools.resolvedTools.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Runtime</span>
                    </div>
                    <div className="adv-section__body">
                        <span className="adv-section__summary">
                            {runtimeTools.resolvedTools.length} tools resolved
                            {runtimeTools.unavailableDetails.length > 0 ? ` · ${runtimeTools.unavailableDetails.length} unavailable` : ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )

    const renderMcpDetail = () => (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">MCP Servers</span>
                </div>
                <div className="adv-section__body">
                    {(performer?.mcpServerNames?.length || unresolvedMcpPlaceholders.length) ? (
                        <div className="adv-list">
                            {(performer?.mcpServerNames || []).map((serverName) => (
                                <div key={serverName} className="adv-list__item">
                                    <Server size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{serverName}</span>
                                    <div className="adv-list__actions">
                                        <button type="button" className="icon-btn" onClick={() => onRemoveMcp(performerId, serverName)} title="Remove MCP">
                                            <X size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {!mcpBindingRows?.length && unresolvedMcpPlaceholders.map((name) => (
                                <div key={`placeholder:${name}`} className="adv-list__item">
                                    <span className="adv-list__label">{name}</span>
                                    <span className="adv-section__summary">Not mapped</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="adv-section__summary">No MCP servers connected. Drag & drop from Asset Library.</span>
                    )}
                </div>
            </div>
            {mcpBindingRows && mcpBindingRows.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Bindings</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="adv-list">
                            {mcpBindingRows.map((binding) => (
                                <label key={`binding:${binding.placeholderName}`} className="adv-field">
                                    <span className="adv-field__label">{binding.placeholderName}</span>
                                    <select
                                        className="select nodrag nowheel"
                                        value={binding.serverName || ''}
                                        onChange={(event) => onSetMcpBinding(performerId, binding.placeholderName, event.target.value || null)}
                                    >
                                        <option value="">Select project MCP server</option>
                                        {(mcpBindingOptions || []).map((option) => (
                                            <option key={option.name} value={option.name} disabled={option.disabled}>
                                                {option.name}{option.disabled ? ' (disabled)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {requestRelations && requestRelations.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Requests</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="adv-list">
                            {requestRelations.map((relation, index) => (
                                <div key={`${relation.targetName}:${index}`} className="adv-list__item">
                                    <Zap size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{relation.targetName}</span>
                                    <span className="adv-section__summary">{relation.description || 'Request relation'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )

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
                ) : !hideBackButton ? (
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
                ) : null}
                <span className="section-title">
                    {detailView
                        ? detailTitles[detailView]
                        : hideBackButton
                            ? performer?.name || 'Performer'
                            : 'Edit'}
                </span>
            </div>

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
            {detailView === 'tal' && renderTalDetail()}
            {detailView === 'dances' && renderDancesDetail()}
            {detailView === 'model' && renderModelDetail()}
            {detailView === 'mcp' && renderMcpDetail()}

        </>
    )
}
