import { Hammer, Lightbulb, Shield } from 'lucide-react'
import type { PerformerNode, SafeOwnerSummary } from '../../types'
import ModelVariantSelect from './ModelVariantSelect'

interface ComposerRuntimeRowProps {
    performerId: string
    performer: PerformerNode | null
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    safeSummary: SafeOwnerSummary | null
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    onSetExecutionMode: () => void
}

export default function ComposerRuntimeRow({
    performerId,
    performer,
    selectedAgentId,
    buildAgent,
    planAgent,
    safeSummary,
    onSetAgentId,
    onSetModelVariant,
    onSetExecutionMode,
}: ComposerRuntimeRowProps) {
    const isPlanAgent = selectedAgentId === 'plan'

    return (
        <div className="chat-input__runtime-row">
            <div className="chat-input__mode-group">
                <button
                    className={`mode-toggle ${selectedAgentId !== 'plan' ? 'is-active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'build') onSetAgentId(performerId, 'build') }}
                    title={buildAgent?.description || 'Build mode'}
                    type="button"
                >
                    <Hammer size={12} />
                    <span>Build</span>
                </button>
                <button
                    className={`mode-toggle mode-plan ${isPlanAgent ? 'is-active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'plan') onSetAgentId(performerId, 'plan') }}
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
                onChange={(value) => onSetModelVariant(performerId, value)}
                className="chat-input__variant"
                compact
                titlePrefix="Performer variant"
            />

            {/* [SAFE-MODE] Hidden from UI — DO NOT REMOVE during cleanup/refactoring.
               Safe mode feature is preserved for future re-enablement.
            <div className="chat-input__safe-group">
                <button
                    className={`mode-toggle mode-safe ${performer?.executionMode === 'safe' ? 'is-active' : ''}`}
                    onClick={(event) => { event.stopPropagation(); void onSetExecutionMode() }}
                    title={performer?.executionMode === 'safe' ? 'Switch default standalone run mode to Direct' : 'Switch default standalone run mode to Safe'}
                    type="button"
                >
                    <Shield size={12} />
                    <span>Safe</span>
                </button>
                {performer?.executionMode === 'safe' ? (
                    <button
                        className={`mode-toggle ${safeSummary?.pendingCount || safeSummary?.conflictCount ? 'is-active' : ''}`}
                        onClick={(event) => { event.stopPropagation() }}
                        title="Review safe mode changes"
                        type="button"
                    >
                        <span>Review</span>
                    </button>
                ) : null}
            </div>
            */}
        </div>
    )
}
