export type ToastTone = 'info' | 'warning' | 'error' | 'success'

export type ToastRecord = {
    id: string
    title?: string
    message: string
    tone: ToastTone
    durationMs: number
    actionLabel?: string
    onAction?: (() => void) | null
    dedupeKey?: string
}

type ToastListener = (toast: ToastRecord) => void

const toastListeners = new Set<ToastListener>()

export function subscribeToToasts(listener: ToastListener) {
    toastListeners.add(listener)
    return () => {
        toastListeners.delete(listener)
    }
}

export function showToast(
    message: string,
    tone: ToastTone = 'info',
    options?: {
        title?: string
        durationMs?: number
        actionLabel?: string
        onAction?: () => void
        dedupeKey?: string
    },
) {
    const toast: ToastRecord = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: options?.title,
        message,
        tone,
        durationMs: options?.durationMs ?? 4000,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction ?? null,
        dedupeKey: options?.dedupeKey,
    }

    for (const listener of toastListeners) {
        listener(toast)
    }

    return toast.id
}
