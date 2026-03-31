type ActThreadLike = {
    id: string
    createdAt: number
}

export function resolvePreferredActThreadId<T extends ActThreadLike>(
    threads: T[],
    activeThreadId: string | null,
): string | null {
    if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) {
        return activeThreadId
    }

    if (threads.length === 0) {
        return null
    }

    return threads.reduce((latest, thread) => (
        thread.createdAt > latest.createdAt ? thread : latest
    )).id
}

export function resolveDisplayedActThread<T extends ActThreadLike>(
    threads: T[],
    activeThreadId: string | null,
): T | null {
    const preferredThreadId = resolvePreferredActThreadId(threads, activeThreadId)
    if (!preferredThreadId) {
        return null
    }

    return threads.find((thread) => thread.id === preferredThreadId) || null
}

export function resolveActThreadOrdinal<T extends ActThreadLike>(
    threads: T[],
    threadId: string | null,
): number | null {
    if (!threadId) {
        return null
    }

    const index = threads.findIndex((thread) => thread.id === threadId)
    return index >= 0 ? index + 1 : null
}
