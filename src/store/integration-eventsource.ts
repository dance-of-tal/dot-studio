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
}

/**
 * Reconnect a managed EventSource if the connection parameters changed.
 *
 * Lifecycle:
 * 1. If existing instance matches current workingDir + extraKey → no-op.
 * 2. Close stale instance (if any).
 * 3. Update slot metadata.
 * 4. Create new EventSource and wire onmessage/onerror.
 */
export function reconnectManagedEventSource(opts: ReconnectOptions): void {
    const { slot, resolveWorkingDir, resolveExtraKey, createEventSource, onMessage } = opts

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

    // Close stale connection.
    const existing = slot.getInstance()
    if (existing) {
        existing.close()
        slot.setInstance(null)
    }

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
    }
}

/**
 * Close and clean up a managed EventSource slot.
 */
export function closeManagedEventSource(slot: EventSourceSlot): void {
    const es = slot.getInstance()
    if (es) {
        es.close()
        slot.setInstance(null)
    }
}
