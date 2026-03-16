/**
 * PerformerEditPanel — Edit mode panel for performer configuration.
 * Extracted from AgentFrame to keep the main component focused.
 */
import { useState, useEffect } from 'react'
import { ArrowLeft, Hexagon, Zap, Cpu, Server } from 'lucide-react'

import { assetRefKey } from '../../lib/performers'
import type { PerformerNode, ModelConfig, AssetRef, DanceDeliveryMode } from '../../types'

import PerformerComposeCards from './PerformerComposeCards'
import PerformerAdvancedSettings from './PerformerAdvancedSettings'
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
    const [editTab, setEditTab] = useState<'basic' | 'advanced'>('basic')
    const [showModelPicker, setShowModelPicker] = useState(false)

    useEffect(() => {
        if (editTab !== 'basic') {
            setShowModelPicker(false)
        }
    }, [editTab])

    return (
        <>
            <div className="edit-workbench__header">
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
                <span className="section-title">Edit</span>
                <div className="edit-workbench__actions">
                    <button
                        className={`tab ${editTab === 'basic' ? 'active' : ''}`}
                        onClick={(event) => {
                            event.stopPropagation()
                            setEditTab('basic')
                        }}
                        title="Basic composition"
                    >
                        Basic
                    </button>
                    <button
                        className={`tab ${editTab === 'advanced' ? 'active' : ''}`}
                        onClick={(event) => {
                            event.stopPropagation()
                            setEditTab('advanced')
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
                        description: presentation.talAsset ? '' : 'No Tal connected yet.',
                        hint: 'Drag & drop from Asset Library',
                        icon: <Hexagon size={12} />,
                        items: presentation.talAsset ? [{
                            key: presentation.talAsset.urn,
                            label: presentation.talAsset.name,
                            description: presentation.talAsset.description || null,
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
                            onRemove: () => onRemoveDance(performerId, performer?.danceRefs[index] ? assetRefKey(performer.danceRefs[index]) || asset.urn : asset.urn),
                        })),
                        isOver: dropRefs.dance.isOver,
                        setNodeRef: dropRefs.dance.setNodeRef,
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
                        onClick: () => setEditTab('advanced'),
                    },
                ]}
            />
            <ModelQuickPicker
                open={editTab === 'basic' && showModelPicker}
                currentModel={performer?.model || null}
                onSelect={(model) => {
                    onModelChange(model)
                    setShowModelPicker(false)
                }}
                onClose={() => setShowModelPicker(false)}
                title="Choose a performer model"
            />
            {editTab === 'advanced' ? (
                <PerformerAdvancedSettings
                    performer={performer}
                    talLabel={presentation.talAsset?.name || null}
                    modelLabel={performer?.model?.modelId || null}
                    agentLabel={formatAgentLabel(selectedAgent?.name) || 'Build'}
                    mcpSummary={presentation.mcpServers.length > 0 ? `${presentation.mcpServers.length} server${presentation.mcpServers.length === 1 ? '' : 's'}` : null}
                    onNameChange={onNameChange}
                    onDanceDeliveryModeChange={onDanceDeliveryModeChange}
                    onOpenTalEditor={() => void onOpenAssetEditor('tal', performer?.talRef || null, 'tal')}
                    onCreateDanceDraft={() => void onOpenAssetEditor('dance', null, 'dance-new')}
                    onEditDance={(ref) => void onOpenAssetEditor('dance', ref, 'dance-replace')}
                    onRemoveDance={(ref) => onRemoveDance(performerId, ref.kind === 'draft' ? ref.draftId : ref.urn)}
                    onClearModel={() => onModelChange(null)}
                    onRemoveMcp={(serverName) => onRemoveMcp(performerId, serverName)}
                    onSetMcpBinding={(placeholderName, serverName) => onSetMcpBinding(performerId, placeholderName, serverName)}

                    mcpBindings={mcpBindingRows}
                    mcpOptions={mcpBindingOptions}
                    runtimeControls={(
                        <>
                            <AgentSelect
                                value={performer?.agentId || null}
                                onChange={onAgentIdChange}
                                titlePrefix="Performer agent"
                            />
                            <ModelVariantSelect
                                model={performer?.model || null}
                                value={performer?.modelVariant || null}
                                onChange={onModelVariantChange}
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
                    executionModeSummary={(
                        <div className="adv-section__summary">
                            Default Run Mode: {performer?.executionMode === 'safe' ? 'Safe' : 'Direct'}.
                            {' '}
                            Mention requests always run in the caller workspace.
                        </div>
                    )}
                    requestRelations={requestRelations}
                />
            ) : null}
        </>
    )
}
