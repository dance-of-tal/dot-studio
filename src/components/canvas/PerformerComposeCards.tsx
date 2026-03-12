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
        <div className={`figma-edit-grid ${hidden ? 'figma-edit-grid--hidden' : ''}`}>
            {cards.map((card) => (
                <div
                    key={card.key}
                    ref={card.setNodeRef}
                    className={`figma-edit-card-shell ${card.isOver ? 'is-over' : ''}`}
                >
                    <button
                        type="button"
                        className="figma-edit-card"
                        onClick={card.onClick}
                        disabled={card.disabled}
                    >
                        <span className="figma-edit-card__icon">{card.icon}</span>
                        <span className="figma-edit-card__body">
                            <strong>{card.title}</strong>
                            {card.hint ? <span className="figma-edit-card__hint">{card.hint}</span> : null}
                            {!card.items?.length ? <span>{card.description}</span> : null}
                        </span>
                    </button>
                    {card.items?.length ? (
                        <div className="figma-edit-card__stack">
                            {card.items.map((item) => (
                                <div key={item.key} className="figma-edit-card__stack-item">
                                    <span className="figma-edit-card__stack-body">
                                        <strong>{item.label}</strong>
                                        {item.description ? <span>{item.description}</span> : null}
                                    </span>
                                    {item.onOpen ? (
                                        <button
                                            type="button"
                                            className="figma-edit-card__remove"
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
                                            className="figma-edit-card__remove"
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
            {footer ? <div className="figma-edit-card-shell figma-edit-card-shell--wide"><div className="figma-edit-card figma-edit-card--wide">{footer}</div></div> : null}
        </div>
    )
}
