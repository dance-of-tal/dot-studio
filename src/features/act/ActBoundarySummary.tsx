import type { PerformerNode, StageAct } from '../../types'
import { resolveActParticipantLabel } from './participant-labels'
import './ActBoundarySummary.css'

type ActBoundarySummaryProps = {
    act: StageAct
    performers: PerformerNode[]
    threadCount: number
    onSelectAct: () => void
    onSelectParticipant: (participantKey: string) => void
    onSelectRelation: (relationId: string) => void
    onOpenCallboard: () => void
    onCreateThread: () => void
    onAddParticipant: () => void
    onAutoLayout: () => void
}

export default function ActBoundarySummary({
    act,
    performers,
    threadCount,
    onSelectAct,
    onSelectParticipant,
    onSelectRelation,
    onOpenCallboard,
    onCreateThread,
    onAddParticipant,
    onAutoLayout,
}: ActBoundarySummaryProps) {
    const participantKeys = Object.keys(act.participants)
    const participantItems = participantKeys.map((key) => ({
        key,
        label: resolveActParticipantLabel(act, key, performers),
    }))
    const relationItems = act.relations.slice(0, 3).map((relation) => ({
        id: relation.id,
        label: `${resolveActParticipantLabel(act, relation.between[0], performers)} ↔ ${resolveActParticipantLabel(act, relation.between[1], performers)}`,
    }))

    return (
        <div
            className="act-frame__summary"
            onClick={onSelectAct}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectAct()
                }
            }}
        >
            <div className="act-frame__summary-stats">
                <span className="act-frame__summary-chip">{participantKeys.length} participants</span>
                <span className="act-frame__summary-chip">{act.relations.length} relations</span>
                <span className="act-frame__summary-chip">{threadCount} threads</span>
            </div>
            {participantItems.length > 0 ? (
                <div className="act-frame__summary-participants">
                    {participantItems.slice(0, 4).map((participant) => (
                        <button
                            key={participant.key}
                            className="act-frame__summary-participant"
                            onClick={(event) => {
                                event.stopPropagation()
                                onSelectParticipant(participant.key)
                            }}
                        >
                            {participant.label}
                        </button>
                    ))}
                    {participantItems.length > 4 ? (
                        <span className="act-frame__summary-participant">+{participantItems.length - 4}</span>
                    ) : null}
                </div>
            ) : (
                <div className="act-frame__summary-empty">Connect performers on the canvas or drag from the Asset Library.</div>
            )}
            {relationItems.length > 0 ? (
                <div className="act-frame__summary-relations">
                    {relationItems.slice(0, 2).map((relation) => (
                        <button
                            key={relation.id}
                            className="act-frame__summary-relation"
                            onClick={(event) => {
                                event.stopPropagation()
                                onSelectRelation(relation.id)
                            }}
                        >
                            {relation.label}
                        </button>
                    ))}
                    {act.relations.length > 2 ? (
                        <span className="act-frame__summary-relation">+{act.relations.length - 2} relations</span>
                    ) : null}
                </div>
            ) : null}
            <div className="act-frame__summary-actions">
                {participantItems.length > 1 ? (
                    <button
                        className="act-frame__summary-action"
                        onClick={(event) => {
                            event.stopPropagation()
                            onAutoLayout()
                        }}
                    >
                        Auto Layout
                    </button>
                ) : null}
                <button
                    className="act-frame__summary-action"
                    onClick={(event) => {
                        event.stopPropagation()
                        onOpenCallboard()
                    }}
                >
                    Callboard
                </button>
                <button
                    className="act-frame__summary-action"
                    onClick={(event) => {
                        event.stopPropagation()
                        onCreateThread()
                    }}
                >
                    New Thread
                </button>
                <button
                    className="act-frame__summary-action"
                    onClick={(event) => {
                        event.stopPropagation()
                        onAddParticipant()
                    }}
                >
                    Add Participant
                </button>
            </div>
        </div>
    )
}
