import { File as FileIcon, Sparkles, X, Zap } from 'lucide-react'
import { assetRefKey } from '../../lib/performers'
import type { TurnDanceSelection } from './agent-frame-utils'

interface PerformerMention {
    performerId: string
    name: string
}

interface ComposerPillBarProps {
    mentionedPerformers: PerformerMention[]
    setMentionedPerformers: React.Dispatch<React.SetStateAction<PerformerMention[]>>
    turnDanceSelections: TurnDanceSelection[]
    setTurnDanceSelections: React.Dispatch<React.SetStateAction<TurnDanceSelection[]>>
    attachments: any[]
    setAttachments: React.Dispatch<React.SetStateAction<any[]>>
}

export default function ComposerPillBar({
    mentionedPerformers,
    setMentionedPerformers,
    turnDanceSelections,
    setTurnDanceSelections,
    attachments,
    setAttachments,
}: ComposerPillBarProps) {
    if (attachments.length === 0 && turnDanceSelections.length === 0 && mentionedPerformers.length === 0) {
        return null
    }

    return (
        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-main)' }}>
            {mentionedPerformers.map((mention, idx) => (
                <div key={`${mention.performerId}:${idx}`} className="turn-option-pill">
                    <Sparkles size={10} style={{ marginRight: '4px' }} />
                    <span>{mention.name}</span>
                    <span className="turn-option-pill__scope turn-option-pill__scope--local">performer</span>
                    <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setMentionedPerformers((current) => current.filter((item) => item.performerId !== mention.performerId))} />
                </div>
            ))}
            {turnDanceSelections.map((selection, idx) => (
                <div key={`${selection.scope}:${assetRefKey(selection.ref) || idx}`} className="turn-option-pill">
                    <Zap size={10} style={{ marginRight: '4px' }} />
                    <span>{selection.label}</span>
                    <span className={`turn-option-pill__scope turn-option-pill__scope--${selection.scope}`}>{selection.scope}</span>
                    <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setTurnDanceSelections((current) => current.filter((_, currentIndex) => currentIndex !== idx))} />
                </div>
            ))}
            {attachments.map((attachment, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>
                    <FileIcon size={10} style={{ marginRight: '4px' }} />
                    {attachment.name}
                    <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setAttachments((current) => current.filter((_, index) => index !== idx))} />
                </div>
            ))}
        </div>
    )
}
