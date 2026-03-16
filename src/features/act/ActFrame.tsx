/**
 * ActFrame — Canvas node representing an Act.
 *
 * Three visual states:
 * 1. Collapsed (not selected): compact card with ⚡ name + meta badges
 * 2. Chat mode (selected, chat toggled on): shows ActChatPanel
 * 3. Edit mode (editing): shows ActEditPanel with mini performer cards + SVG relations
 */
import { useMemo, useState } from 'react'
import { Zap, Pencil, MessageSquare, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import ActEditPanel from './ActEditPanel'
import ActChatPanel from './ActChatPanel'
import './ActFrame.css'

export default function ActFrame({ data, id }: any) {
    const {
        acts,
        selectedActId,
        editingActId,
        selectAct,
        enterActEditFocus,
        removeAct,
        updateActSize,
    } = useStudioStore()

    // ALL hooks MUST be called before any conditional return
    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const [chatOpen, setChatOpen] = useState(false)

    // Now we can conditionally return
    if (!act) return null

    const isSelected = selectedActId === id
    const isEditing = editingActId === id
    const performerCount = Object.keys(act.performers).length
    const relationCount = act.relations.length

    const showChat = isSelected && chatOpen && !isEditing
    const showEdit = isEditing

    const width = data.width || act.width || 340
    const editHeight = Math.max(400, act.height || 0)
    const height = showEdit
        ? editHeight
        : showChat
            ? 360
            : 80

    const handleResizeEnd = () => {
        const node = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
        if (node) {
            const rect = node.getBoundingClientRect()
            updateActSize(id, Math.round(rect.width), Math.round(rect.height))
        }
    }

    return (
        <CanvasWindowFrame
            className={`act-frame ${showEdit ? 'act-frame--editing' : ''} ${isSelected ? 'act-frame--selected' : ''} ${showChat ? 'act-frame--chat' : ''}`}
            width={width}
            height={height}
            resizable={showEdit}
            minWidth={340}
            minHeight={showEdit ? 300 : showChat ? 200 : 80}
            transformActive={data.transformActive || false}
            onActivateTransform={data.onActivateTransform}
            onDeactivateTransform={data.onDeactivateTransform}
            onResizeEnd={handleResizeEnd}
            selected={isSelected}
            headerStart={
                <div className="act-frame__title" onClick={() => selectAct(id)}>
                    <Zap size={12} className="act-frame__icon" />
                    <span className="act-frame__name">{act.name}</span>
                </div>
            }
            headerEnd={
                <div className="act-frame__header-actions">
                    <button
                        className={`icon-btn act-frame__chat-btn ${showChat ? 'icon-btn--active' : ''}`}
                        title={showChat ? 'Close chat' : 'Open chat'}
                        onClick={() => {
                            setChatOpen(!chatOpen)
                            if (!isSelected) selectAct(id)
                        }}
                    >
                        <MessageSquare size={11} />
                    </button>
                    <button
                        className={`icon-btn act-frame__edit-btn ${showEdit ? 'icon-btn--active' : ''}`}
                        title={showEdit ? 'Close edit mode' : 'Edit Act'}
                        onClick={() => enterActEditFocus(id)}
                    >
                        <Pencil size={11} />
                    </button>
                    <button
                        className="icon-btn act-frame__close-btn"
                        title="Remove Act"
                        onClick={() => removeAct(id)}
                    >
                        <X size={11} />
                    </button>
                </div>
            }
        >
            {/* ── Collapsed View: Meta badges ── */}
            {!showEdit && !showChat && (
                <div className="act-frame__meta">
                    <span className="act-frame__badge">{performerCount}p</span>
                    <span className="act-frame__badge">{relationCount}r</span>
                    <span className="act-frame__badge act-frame__badge--mode">
                        {act.executionMode === 'safe' ? 'Safe' : 'Direct'}
                    </span>
                </div>
            )}

            {/* ── Chat Mode ── */}
            {showChat && (
                <ActChatPanel actId={id} />
            )}

            {/* ── Edit Mode ── */}
            {showEdit && (
                <ActEditPanel actId={id} />
            )}

        </CanvasWindowFrame>
    )
}
