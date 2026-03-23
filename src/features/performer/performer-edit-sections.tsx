import { Hexagon, Zap, Pencil, X, Server } from 'lucide-react'
import type { AssetRef, DanceDeliveryMode, ModelConfig, PerformerNode } from '../../types'
import { assetUrnDisplayName } from '../../lib/asset-urn'
import ModelVariantSelect from './ModelVariantSelect'

function assetRefLabel(ref: AssetRef) {
    return ref.kind === 'draft'
        ? `Draft ${ref.draftId.slice(0, 8)}`
        : assetUrnDisplayName(ref.urn)
}

export function PerformerTalDetail({
    performer,
    talAsset,
    onOpenAssetEditor,
    onTalRefChange,
}: {
    performer: PerformerNode | null
    talAsset: { urn: string; name: string; description?: string } | null
    onOpenAssetEditor: (kind: 'tal' | 'dance', targetRef: AssetRef | null, attachMode: 'tal' | 'dance-new' | 'dance-replace') => void
    onTalRefChange: (ref: AssetRef | null) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Tal</span>
                    {performer?.talRef && (
                        <button type="button" className="btn btn--sm" onClick={() => void onOpenAssetEditor('tal', performer.talRef, 'tal')}>
                            Edit
                        </button>
                    )}
                </div>
                <div className="adv-section__body">
                    {talAsset ? (
                        <div className="adv-list">
                            <div className="adv-list__item">
                                <Hexagon size={10} className="adv-list__icon" />
                                <span className="adv-list__label">{talAsset.name}</span>
                                {talAsset.description ? (
                                    <span className="adv-section__summary">{talAsset.description}</span>
                                ) : null}
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
                        <span className="adv-section__summary">No Tal connected. Drag & drop from the Asset Library.</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export function PerformerDancesDetail({
    performer,
    performerId,
    onOpenAssetEditor,
    onRemoveDance,
    onDanceDeliveryModeChange,
}: {
    performer: PerformerNode | null
    performerId: string
    onOpenAssetEditor: (kind: 'tal' | 'dance', targetRef: AssetRef | null, attachMode: 'tal' | 'dance-new' | 'dance-replace') => void
    onRemoveDance: (id: string, key: string) => void
    onDanceDeliveryModeChange: (value: DanceDeliveryMode) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Dances</span>
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
                        <span className="adv-section__summary">No dances connected. Drag & drop from the Asset Library.</span>
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
}

export function PerformerModelDetail({
    performer,
    runtimeTools,
    onModelChange,
    onModelVariantChange,
}: {
    performer: PerformerNode | null
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    onModelChange: (model: ModelConfig | null) => void
    onModelVariantChange: (variant: string | null) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Model</span>
                    {performer?.model ? (
                        <button type="button" className="btn btn--sm" onClick={() => onModelChange(null)}>
                            Clear
                        </button>
                    ) : null}
                </div>
                <div className="adv-section__body">
                    <span className="adv-section__summary">
                        {performer?.model
                            ? `${performer.model.provider} / ${performer.model.modelId}`
                            : performer?.modelPlaceholder
                                ? 'No model selected'
                                : 'No model selected'}
                    </span>
                    {performer?.modelPlaceholder && (
                        <span className="adv-section__hint">
                            Recommended: {performer.modelPlaceholder.provider}/{performer.modelPlaceholder.modelId}
                        </span>
                    )}
                </div>
            </div>
            {performer?.model ? (
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
            ) : null}
            {runtimeTools && runtimeTools.resolvedTools.length > 0 ? (
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
            ) : null}
        </div>
    )
}

export function PerformerMcpDetail({
    performer,
    performerId,
    unresolvedMcpPlaceholders,
    mcpBindingRows,
    mcpBindingOptions,
    requestRelations,
    onRemoveMcp,
    onSetMcpBinding,
}: {
    performer: PerformerNode | null
    performerId: string
    unresolvedMcpPlaceholders: string[]
    mcpBindingRows: Array<{ placeholderName: string; serverName: string | null }>
    mcpBindingOptions: Array<{ name: string; disabled: boolean }>
    requestRelations: Array<{ targetName: string; description?: string | undefined }>
    onRemoveMcp: (id: string, serverName: string) => void
    onSetMcpBinding: (id: string, placeholderName: string, serverName: string | null) => void
}) {
    return (
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
            {mcpBindingRows && mcpBindingRows.length > 0 ? (
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
            ) : null}
            {requestRelations && requestRelations.length > 0 ? (
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
            ) : null}
        </div>
    )
}
