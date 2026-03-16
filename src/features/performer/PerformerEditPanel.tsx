/**
 * PerformerEditPanel — Unified edit panel for performer configuration.
 * Shared between standalone AgentFrame and Act's ActPerformerFrame.
 *
 * Single scrollable layout (no tabs):
 *   - Name input
 *   - Compose cards (Tal, Dances, Model, MCP) with DnD
 *   - Model variant & agent selector (inline, beneath model card)
 *   - Advanced settings (delivery mode, MCP bindings, runtime)
 */
import { useState } from 'react'
import { ArrowLeft, Hexagon, Zap, Cpu, Server, Pencil, X } from 'lucide-react'

import { assetRefKey, unresolvedDeclaredMcpServerNames } from '../../lib/performers'
import type { PerformerNode, ModelConfig, AssetRef, DanceDeliveryMode } from '../../types'

import PerformerComposeCards from './PerformerComposeCards'
import ModelQuickPicker from './ModelQuickPicker'
import ModelVariantSelect from './ModelVariantSelect'
import AgentSelect from './AgentSelect'
import { formatAgentLabel } from './agent-frame-utils'

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
    selectedAgent: { name: string; description?: string } | null
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
    onAgentIdChange: (agentId: string | null) => void
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
    selectedAgent,
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
    onAgentIdChange,
    onRemoveDance,
    onRemoveMcp,
    onSetMcpBinding,

    onOpenAssetEditor,
}: PerformerEditPanelProps) {
    const [showModelPicker, setShowModelPicker] = useState(false)
    const unresolvedMcpPlaceholders = performer ? unresolvedDeclaredMcpServerNames(performer) : []

    return (
        <>
            {/* ── Header ── */}
            <div className="edit-workbench__header">
                {!hideBackButton && (
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
                <span className="section-title">{hideBackButton ? performer?.name || 'Performer' : 'Edit'}</span>
            </div>

            {/* ── Name ── */}
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

            {/* ── Compose Cards (Tal / Dances / Model / MCP) ── */}
            <PerformerComposeCards
                cards={[
                    {
                        key: 'tal',
                        title: 'Tal',
                        description: presentation.talAsset ? '' : 'No Tal connected yet.',
                        hint: 'Drag & drop from Asset Library',
                        icon: <Hexagon size={12} />,
                        items: presentation.talAsset ? [{
                            key: presentation.talAsset.urn,
                            label: presentation.talAsset.name,
                            description: presentation.talAsset.description || null,
                            onOpen: () => void onOpenAssetEditor('tal', performer?.talRef || null, 'tal'),
                            onRemove: () => onTalRefChange(null),
                        }] : undefined,
                        isOver: dropRefs.tal.isOver,
                        setNodeRef: dropRefs.tal.setNodeRef,
                        onClick: () => {
                            if (performer?.talRef) {
                                void onOpenAssetEditor('tal', performer.talRef, 'tal')
                            } else {
                                void onOpenAssetEditor('tal', null, 'tal')
                            }
                        },
                    },
                    {
                        key: 'dances',
                        title: 'Dances',
                        description: presentation.danceAssets.length > 0 ? '' : 'No Dances connected yet.',
                        hint: 'Drag & drop from Asset Library',
                        icon: <Zap size={12} />,
                        items: presentation.danceAssets.map((asset, index) => ({
                            key: `${asset.urn}:${index}`,
                            label: asset.name,
                            description: asset.description || null,
                            onOpen: performer?.danceRefs[index]
                                ? () => void onOpenAssetEditor('dance', performer.danceRefs[index], 'dance-replace')
                                : undefined,
                            onRemove: () => onRemoveDance(performerId, performer?.danceRefs[index] ? assetRefKey(performer.danceRefs[index]) || asset.urn : asset.urn),
                        })),
                        isOver: dropRefs.dance.isOver,
                        setNodeRef: dropRefs.dance.setNodeRef,
                        onClick: () => void onOpenAssetEditor('dance', null, 'dance-new'),
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
                            onRemove: () => onModelChange(null),
                        }] : performer?.modelPlaceholder ? [{
                            key: `${performer.modelPlaceholder.provider}:${performer.modelPlaceholder.modelId}:placeholder`,
                            label: performer.modelPlaceholder.modelId,
                            description: `Missing in current Studio runtime · ${performer.modelPlaceholder.provider}`,
                            onRemove: () => onModelChange(null),
                        }] : undefined,
                        isOver: dropRefs.model.isOver,
                        setNodeRef: dropRefs.model.setNodeRef,
                        onClick: () => setShowModelPicker((current) => !current),
                    },
                    {
                        key: 'mcp',
                        title: 'MCP',
                        description: presentation.mcpServers.length > 0 || presentation.mcpPlaceholders.length > 0 ? '' : 'No MCP servers connected yet.',
                        hint: 'Drag & drop from Asset Library',
                        icon: <Server size={12} />,
                        items: [
                            ...presentation.mcpServers.map((server) => ({
                                key: server.name,
                                label: server.name,
                                description: `${server.status}${server.tools.length ? ` · ${server.tools.length} tools` : ''}`,
                                onRemove: () => onRemoveMcp(performerId, server.name),
                            })),
                            ...presentation.mcpPlaceholders.map((name) => ({
                                key: `placeholder:${name}`,
                                label: name,
                                description: 'Imported from asset · not mapped in Asset Library MCP catalog',
                            })),
                        ],
                        isOver: dropRefs.mcp.isOver,
                        setNodeRef: dropRefs.mcp.setNodeRef,
                    },
                ]}
            />
            <ModelQuickPicker
                open={showModelPicker}
                currentModel={performer?.model || null}
                onSelect={(model) => {
                    onModelChange(model)
                    setShowModelPicker(false)
                }}
                onClose={() => setShowModelPicker(false)}
                title="Choose a performer model"
            />

            {/* ── Model Options (inline: variant + agent) ── */}
            {performer?.model && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Model Options</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="adv-runtime-controls">
                            <AgentSelect
                                value={performer.agentId || null}
                                onChange={onAgentIdChange}
                                titlePrefix="Performer agent"
                            />
                            <ModelVariantSelect
                                model={performer.model}
                                value={performer.modelVariant || null}
                                onChange={onModelVariantChange}
                                titlePrefix="Performer variant"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dance Delivery ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Dance Delivery</span>
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

            {/* ── Dance List (edit/remove individual dances) ── */}
            {performer?.danceRefs?.length ? (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Dance Details</span>
                        <button type="button" className="btn btn--sm" onClick={() => void onOpenAssetEditor('dance', null, 'dance-new')}>
                            + New
                        </button>
                    </div>
                    <div className="adv-section__body">
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
                    </div>
                </div>
            ) : null}

            {/* ── MCP Bindings ── */}
            {(unresolvedMcpPlaceholders.length > 0 || (mcpBindingRows && mcpBindingRows.length > 0)) && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">MCP Bindings</span>
                    </div>
                    <div className="adv-section__body">
                        {unresolvedMcpPlaceholders.length > 0 && !mcpBindingRows?.length && (
                            <div className="adv-list">
                                {unresolvedMcpPlaceholders.map((name) => (
                                    <div key={`placeholder:${name}`} className="adv-list__item">
                                        <span className="adv-list__label">{name}</span>
                                        <span className="adv-section__summary">Not mapped</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {mcpBindingRows && mcpBindingRows.length > 0 && (
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
                        )}
                    </div>
                </div>
            )}

            {/* ── Request Relations ── */}
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
                                    <span className="adv-section__summary">
                                        {relation.description || 'Request relation'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Runtime Status ── */}
            {runtimeTools && runtimeTools.resolvedTools.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Runtime</span>
                    </div>
                    <div className="adv-section__body">
                        <span className="adv-section__summary">
                            Agent: {formatAgentLabel(selectedAgent?.name) || 'Build'} · {runtimeTools.resolvedTools.length} tools
                            {runtimeTools.unavailableDetails.length > 0 ? ` · ${runtimeTools.unavailableDetails.length} unavailable` : ''}
                        </span>
                    </div>
                </div>
            )}
        </>
    )
}
