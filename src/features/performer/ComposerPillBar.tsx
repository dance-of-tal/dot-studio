import { File as FileIcon, Zap, X } from 'lucide-react'
import { assetRefKey } from '../../lib/performers'
import type { FileMention } from '../../hooks/useFileMentions'
import type { TurnDanceSelection } from './agent-frame-utils'

interface ComposerPillBarProps {
    turnDanceSelections: TurnDanceSelection[]
    setTurnDanceSelections: React.Dispatch<React.SetStateAction<TurnDanceSelection[]>>
    attachments: FileMention[]
    setAttachments: React.Dispatch<React.SetStateAction<FileMention[]>>
}

export default function ComposerPillBar({
    turnDanceSelections,
    setTurnDanceSelections,
    attachments,
    setAttachments,
}: ComposerPillBarProps) {
    if (attachments.length === 0 && turnDanceSelections.length === 0) {
        return null
    }

    return (
        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-main)' }}>
            {turnDanceSelections.map((selection, idx) => (
                <div key={`${selection.scope}:${assetRefKey(selection.ref) || idx}`} className="turn-option-pill">
                    <Zap size={10} style={{ marginRight: '4px' }} />
                    <span>{selection.label}</span>
                    <span className={`turn-option-pill__scope turn-option-pill__scope--${selection.scope}`}>{selection.scope}</span>
                    <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setTurnDanceSelections((current) => current.filter((_, currentIndex) => currentIndex !== idx))} />
                </div>
            ))}
            {attachments.map((attachment, idx) => (
                <div
                    key={idx}
                    className="composer-attachment-pill"
                    title={attachment.name}
                >
                    <FileIcon size={10} style={{ marginRight: '4px' }} />
                    {attachment.name}
                    <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setAttachments((current) => current.filter((_, index) => index !== idx))} />
                </div>
            ))}
        </div>
    )
}
