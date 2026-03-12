import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { subscribeToToasts, type ToastRecord } from '../../lib/toast'
import './ToastViewport.css'

type VisibleToast = ToastRecord & {
    repeatCount: number
}

function getToastDedupeKey(toast: Pick<ToastRecord, 'dedupeKey' | 'tone' | 'title' | 'message'>) {
    return toast.dedupeKey || `${toast.tone}:${toast.title || ''}:${toast.message}`
}

export default function ToastViewport() {
    const [toasts, setToasts] = useState<VisibleToast[]>([])
    const timeoutMapRef = useRef<Record<string, number>>({})

    useEffect(() => {
        const unsubscribe = subscribeToToasts((toast) => {
            const dedupeKey = getToastDedupeKey(toast)
            let targetId = toast.id

            setToasts((current) => {
                const existing = current.find((item) => getToastDedupeKey(item) === dedupeKey)
                if (existing) {
                    targetId = existing.id
                    return current.map((item) => (
                        item.id === existing.id
                            ? {
                                ...item,
                                repeatCount: item.repeatCount + 1,
                                durationMs: toast.durationMs,
                                actionLabel: toast.actionLabel,
                                onAction: toast.onAction,
                            }
                            : item
                    ))
                }

                return [...current, { ...toast, repeatCount: 1 }]
            })

            if (timeoutMapRef.current[targetId]) {
                window.clearTimeout(timeoutMapRef.current[targetId])
            }

            timeoutMapRef.current[targetId] = window.setTimeout(() => {
                setToasts((current) => current.filter((item) => item.id !== targetId))
                delete timeoutMapRef.current[targetId]
            }, toast.durationMs)
        })

        return () => {
            Object.values(timeoutMapRef.current).forEach((timer) => window.clearTimeout(timer))
            timeoutMapRef.current = {}
            unsubscribe()
        }
    }, [])

    if (toasts.length === 0) {
        return null
    }

    return (
        <div className="studio-toast-viewport" aria-live="polite" aria-atomic="true">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`studio-toast-card studio-toast-card--${toast.tone}`}
                    role="status"
                >
                    <div className="studio-toast-card__content">
                        {toast.title ? <strong className="studio-toast-card__title">{toast.title}</strong> : null}
                        <span className="studio-toast-card__message">
                            {toast.message}
                            {toast.repeatCount > 1 ? (
                                <span className="studio-toast-card__count">×{toast.repeatCount}</span>
                            ) : null}
                        </span>
                        {toast.actionLabel && toast.onAction ? (
                            <button
                                type="button"
                                className="studio-toast-card__action"
                                onClick={() => {
                                    toast.onAction?.()
                                    if (timeoutMapRef.current[toast.id]) {
                                        window.clearTimeout(timeoutMapRef.current[toast.id])
                                        delete timeoutMapRef.current[toast.id]
                                    }
                                    setToasts((current) => current.filter((item) => item.id !== toast.id))
                                }}
                            >
                                {toast.actionLabel}
                            </button>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="studio-toast-card__dismiss"
                        onClick={() => {
                            if (timeoutMapRef.current[toast.id]) {
                                window.clearTimeout(timeoutMapRef.current[toast.id])
                                delete timeoutMapRef.current[toast.id]
                            }
                            setToasts((current) => current.filter((item) => item.id !== toast.id))
                        }}
                        aria-label="Dismiss notification"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    )
}
