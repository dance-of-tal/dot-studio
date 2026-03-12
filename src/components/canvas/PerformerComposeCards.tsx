import type { ReactNode } from 'react'
import { Pencil, X } from 'lucide-react'

export type PerformerComposeCardItem = {
    key: string
    label: string
    description?: string | null
    onOpen?: () => void
    onRemove?: () => void
}

export type PerformerComposeCard = {
    key: string
    title: string
    description: string
    hint?: string
    icon: ReactNode
    items?: PerformerComposeCardItem[]
    isOver?: boolean
    disabled?: boolean
    onClick?: () => void
    setNodeRef?: (element: HTMLElement | null) => void
}

type PerformerComposeCardsProps = {
    cards: PerformerComposeCard[]
    footer?: ReactNode
    hidden?: boolean
}

export default function PerformerComposeCards({
    cards,
    footer,
    hidden = false,
}: PerformerComposeCardsProps) {
    return (
        <div className={`edit-grid ${hidden ? 'edit-grid--hidden' : ''}`}>
            {cards.map((card) => (
                <div
                    key={card.key}
                    ref={card.setNodeRef}
                    className={`edit-card-shell ${card.isOver ? 'is-over' : ''}`}
                >
                    <button
                        type="button"
                        className="edit-card"
                        onClick={card.onClick}
                        disabled={card.disabled}
                    >
                        <span className="edit-card__icon">{card.icon}</span>
                        <span className="edit-card__body">
                            <strong>{card.title}</strong>
                            {card.hint ? <span className="edit-card__hint">{card.hint}</span> : null}
                            {!card.items?.length ? <span>{card.description}</span> : null}
                        </span>
                    </button>
                    {card.items?.length ? (
                        <div className="edit-card__stack">
                            {card.items.map((item) => (
                                <div key={item.key} className="edit-card__stack-item">
                                    <span className="edit-card__stack-body">
                                        <strong>{item.label}</strong>
                                        {item.description ? <span>{item.description}</span> : null}
                                    </span>
                                    {item.onOpen ? (
                                        <button
                                            type="button"
                                            className="edit-card__remove"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                item.onOpen?.()
                                            }}
                                            title={`Edit ${item.label}`}
                                        >
                                            <Pencil size={10} />
                                        </button>
                                    ) : null}
                                    {item.onRemove ? (
                                        <button
                                            type="button"
                                            className="edit-card__remove"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                item.onRemove?.()
                                            }}
                                            title={`Remove ${item.label}`}
                                        >
                                            <X size={10} />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ))}
            {footer ? <div className="edit-card-shell edit-card-shell--wide"><div className="edit-card edit-card--wide">{footer}</div></div> : null}
        </div>
    )
}
