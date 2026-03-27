/**
 * Shared EventSource reconnection factory.
 *
 * Each EventSource stream (chat, act-runtime, adapter-view) follows the same
 * lifecycle pattern: guard against redundant connections, close stale ones,
 * create fresh instances, and wire up onmessage/onerror. This module
 * captures that pattern once and lets each stream supply only its unique
 * parts (how to create the source, how to handle messages).
 */

// ── Slot: mutable holder for one EventSource connection ──

export interface EventSourceSlot {
    getInstance: () => EventSource | null
    setInstance: (es: EventSource | null) => void
    getWorkingDir: () => string | null
    setWorkingDir: (dir: string | null) => void
    /** Optional extra key (e.g. actSessionId) used by act stream. */
    getExtraKey?: () => string | null
    setExtraKey?: (key: string | null) => void
}

// ── Auto-reconnect tracking ─────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5
const BASE_RECONNECT_DELAY_MS = 2000

const slotReconnectAttempts = new WeakMap<EventSourceSlot, number>()
const slotReconnectTimers = new WeakMap<EventSourceSlot, ReturnType<typeof setTimeout>>()

function disposeEventSource(es: EventSource | null) {
    if (!es) {
        return
    }
    es.onmessage = null
    es.onerror = null
    es.close()
}

function getReconnectAttempts(slot: EventSourceSlot): number {
    return slotReconnectAttempts.get(slot) || 0
}

function resetReconnectAttempts(slot: EventSourceSlot) {
    slotReconnectAttempts.set(slot, 0)
    const timer = slotReconnectTimers.get(slot)
    if (timer) {
        clearTimeout(timer)
        slotReconnectTimers.delete(slot)
    }
}

// ── Factory ─────────────────────────────────────────────

export interface ReconnectOptions {
    /** Slot holding instance, workingDir, and optional extra key. */
    slot: EventSourceSlot
    /** Resolve current workingDir from app state. */
    resolveWorkingDir: () => string | null
    /** Resolve optional extra key from app state (e.g. actSessionId). */
    resolveExtraKey?: () => string | null
    /** Create a new EventSource. Return `null` to skip connection. */
    createEventSource: () => EventSource | null
    /** Handle a parsed JSON message event. */
    onMessage: (data: unknown) => void
    /** Called when the SSE connection drops (before reconnect attempt). */
    onDisconnect?: () => void
}

/**
 * Reconnect a managed EventSource if the connection parameters changed.
 *
 * Lifecycle:
 * 1. If existing instance matches current workingDir + extraKey → no-op.
 * 2. Close stale instance (if any).
 * 3. Update slot metadata.
 * 4. Create new EventSource and wire onmessage/onerror.
 *
 * On error the handler auto-reconnects with exponential backoff
 * (up to MAX_RECONNECT_ATTEMPTS). The retry counter resets on every
 * successful message, so transient failures don't exhaust the budget.
 */
export function reconnectManagedEventSource(opts: ReconnectOptions): void {
    const { slot, resolveWorkingDir, resolveExtraKey, createEventSource, onMessage, onDisconnect } = opts

    const workingDir = resolveWorkingDir()
    const extraKey = resolveExtraKey?.() ?? null

    // Already connected with the same parameters — no-op.
    if (
        slot.getInstance()
        && slot.getWorkingDir() === workingDir
        && (!slot.getExtraKey || slot.getExtraKey() === extraKey)
    ) {
        return
    }

    // Close stale connection and cancel pending reconnect timer.
    const existing = slot.getInstance()
    if (existing) {
        disposeEventSource(existing)
        slot.setInstance(null)
    }
    resetReconnectAttempts(slot)

    // Update tracked metadata.
    slot.setWorkingDir(workingDir)
    slot.setExtraKey?.(extraKey)

    // Create fresh EventSource.
    const es = createEventSource()
    if (!es) {
        return
    }

    slot.setInstance(es)

    es.onmessage = (event) => {
        // Successful message — reset reconnect budget.
        resetReconnectAttempts(slot)
        try {
            const data = JSON.parse(event.data)
            onMessage(data)
        } catch {
            // Ignore malformed events and keep the stream alive.
        }
    }

    es.onerror = () => {
        const current = slot.getInstance()
        if (current) {
            current.close()
            slot.setInstance(null)
        }

        // Notify caller of disconnection (clear loading states, etc.)
        onDisconnect?.()

        // Auto-reconnect with exponential backoff.
        const attempt = getReconnectAttempts(slot)
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
            // Exhausted retries — give up until the next explicit
            // initRealtimeEvents() call (e.g. on next sendMessage).
            return
        }

        slotReconnectAttempts.set(slot, attempt + 1)
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt) // 2s, 4s, 8s, 16s, 32s
        const timer = setTimeout(() => {
            slotReconnectTimers.delete(slot)
            try {
                // Clear workingDir so the guard at the top doesn't no-op.
                slot.setWorkingDir(null)
                reconnectManagedEventSource(opts)
            } catch {
                // Ignore — next sendMessage will also call initRealtimeEvents.
            }
        }, delay)
        slotReconnectTimers.set(slot, timer)
    }
}

/**
 * Close and clean up a managed EventSource slot.
 */
export function closeManagedEventSource(slot: EventSourceSlot): void {
    const es = slot.getInstance()
    if (es) {
        disposeEventSource(es)
        slot.setInstance(null)
    }
}

/**
 * Reset a managed EventSource slot — close the existing connection AND
 * clear the tracked workingDir so the next `reconnectManagedEventSource`
 * call will establish a fresh SSE subscription with updated directory sets.
 *
 * Use this when the set of subscribed execution directories has changed
 * (e.g. after creating a new safe-mode performer session) but the
 * workingDir itself hasn't.
 */
export function resetManagedEventSource(slot: EventSourceSlot): void {
    closeManagedEventSource(slot)
    resetReconnectAttempts(slot)
    slot.setWorkingDir(null)
    slot.setExtraKey?.(null)
}
