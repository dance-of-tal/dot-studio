import type { ReactNode } from 'react'
import { Pencil, X, Zap } from 'lucide-react'
import type { AssetRef, DanceDeliveryMode, PerformerNode } from '../../types'
import { unresolvedDeclaredMcpServerNames } from '../../lib/performers'

type PerformerAdvancedSettingsProps = {
    performer: PerformerNode | null
    talLabel: string | null
    modelLabel: string | null
    agentLabel?: string | null
    mcpSummary: string | null
    onNameChange?: (value: string) => void
    onDanceDeliveryModeChange?: (value: DanceDeliveryMode) => void
    onOpenTalEditor?: () => void
    onCreateDanceDraft?: () => void
    onEditDance?: (ref: AssetRef) => void
    onRemoveDance?: (ref: AssetRef) => void
    onClearModel?: () => void
    onRemoveMcp?: (serverName: string) => void
    onSetMcpBinding?: (placeholderName: string, serverName: string | null) => void
    onAutoCompactChange?: (enabled: boolean) => void
    mcpBindings?: Array<{ placeholderName: string; serverName: string | null }>
    mcpOptions?: Array<{ name: string; disabled?: boolean }>
    runtimeControls?: ReactNode
    runtimeStatus?: ReactNode
}

function assetRefLabel(ref: AssetRef) {
    return ref.kind === 'draft'
        ? `Draft ${ref.draftId.slice(0, 8)}`
        : ref.urn.split('/').pop() || ref.urn
}

export default function PerformerAdvancedSettings({
    performer,
    talLabel,
    modelLabel,
    agentLabel,
    mcpSummary,
    onNameChange,
    onDanceDeliveryModeChange,
    onOpenTalEditor,
    onCreateDanceDraft,
    onEditDance,
    onRemoveDance,
    onClearModel,
    onRemoveMcp,
    onSetMcpBinding,
    onAutoCompactChange,
    mcpBindings,
    mcpOptions,
    runtimeControls,
    runtimeStatus,
}: PerformerAdvancedSettingsProps) {
    const unresolvedMcpPlaceholders = performer ? unresolvedDeclaredMcpServerNames(performer) : []
    return (
        <div className="figma-edit-advanced nodrag nowheel">
            {/* ── Identity ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Identity</span>
                </div>
                <div className="adv-section__body">
                    <label className="adv-field">
                        <span className="adv-field__label">Name</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={performer?.name || ''}
                            onChange={(event) => onNameChange?.(event.target.value)}
                        />
                    </label>
                    <label className="adv-field">
                        <span className="adv-field__label">Dance Delivery</span>
                        <select
                            className="select nodrag nowheel"
                            value={performer?.danceDeliveryMode || 'auto'}
                            onChange={(event) => onDanceDeliveryModeChange?.(event.target.value as DanceDeliveryMode)}
                        >
                            <option value="auto">Auto</option>
                            <option value="tool">Tool</option>
                        </select>
                    </label>
                </div>
            </div>

            {/* ── Tal ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Tal</span>
                    <button type="button" className="btn btn--sm" onClick={onOpenTalEditor}>
                        {performer?.talRef ? 'Edit' : '+ New'}
                    </button>
                </div>
                <div className="adv-section__body">
                    <span className="adv-section__summary">
                        {talLabel || 'No Tal connected'}
                    </span>
                </div>
            </div>

            {/* ── Dances ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Dances</span>
                    <button type="button" className="btn btn--sm" onClick={onCreateDanceDraft} disabled={!onCreateDanceDraft}>
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
                                        {onEditDance ? (
                                            <button type="button" className="icon-btn" onClick={() => onEditDance(ref)} title="Edit dance">
                                                <Pencil size={10} />
                                            </button>
                                        ) : null}
                                        {onRemoveDance ? (
                                            <button type="button" className="icon-btn" onClick={() => onRemoveDance(ref)} title="Remove dance">
                                                <X size={10} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="adv-section__summary">No dances connected</span>
                    )}
                </div>
            </div>

            {/* ── Runtime ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Runtime</span>
                    {performer?.model && onClearModel ? (
                        <button type="button" className="btn btn--sm" onClick={onClearModel}>
                            Clear Model
                        </button>
                    ) : null}
                </div>
                <div className="adv-section__body">
                    <span className="adv-section__summary">
                        Model: {modelLabel || (performer?.modelPlaceholder ? `${performer.modelPlaceholder.provider}/${performer.modelPlaceholder.modelId} (placeholder)` : 'Not set')} · {agentLabel || 'Build'}
                    </span>
                    {runtimeControls ? (
                        <div className="adv-runtime-controls">
                            {runtimeControls}
                        </div>
                    ) : null}
                    {runtimeStatus ? runtimeStatus : null}
                    <label className="adv-toggle">
                        <input
                            type="checkbox"
                            className="adv-toggle__input"
                            checked={performer?.autoCompact !== false}
                            onChange={(event) => onAutoCompactChange?.(event.target.checked)}
                        />
                        <span className="adv-toggle__switch" />
                        <span className="adv-toggle__label">Auto-Compact</span>
                        <span className="adv-toggle__hint">Compact when context fills</span>
                    </label>
                </div>
            </div>

            {/* ── MCP Servers ── */}
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">MCP Servers</span>
                </div>
                <div className="adv-section__body">
                    {performer?.mcpServerNames?.length || unresolvedMcpPlaceholders.length ? (
                        <div className="adv-list">
                            {(performer?.mcpServerNames || []).map((serverName) => (
                                <div key={serverName} className="adv-list__item">
                                    <span className="adv-list__label">{serverName}</span>
                                    {onRemoveMcp ? (
                                        <div className="adv-list__actions">
                                            <button type="button" className="icon-btn" onClick={() => onRemoveMcp(serverName)} title="Remove MCP">
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                            {!mcpBindings?.length ? unresolvedMcpPlaceholders.map((serverName) => (
                                <div key={`placeholder:${serverName}`} className="adv-list__item">
                                    <span className="adv-list__label">{serverName}</span>
                                    <span className="adv-section__summary">Imported from asset · not mapped in Asset Library MCP catalog</span>
                                </div>
                            )) : null}
                        </div>
                    ) : (
                        <span className="adv-section__summary">{mcpSummary || 'No MCP servers connected'}</span>
                    )}
                    {mcpBindings && mcpBindings.length > 0 ? (
                        <div className="adv-list" style={{ marginTop: 10 }}>
                            {mcpBindings.map((binding) => (
                                <label key={`binding:${binding.placeholderName}`} className="adv-field">
                                    <span className="adv-field__label">{binding.placeholderName}</span>
                                    <select
                                        className="select nodrag nowheel"
                                        value={binding.serverName || ''}
                                        onChange={(event) => onSetMcpBinding?.(binding.placeholderName, event.target.value || null)}
                                    >
                                        <option value="">Select project MCP server</option>
                                        {(mcpOptions || []).map((option) => (
                                            <option key={option.name} value={option.name} disabled={option.disabled}>
                                                {option.name}{option.disabled ? ' (disabled)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
