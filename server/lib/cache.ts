// ── Server-side TTL Cache ────────────────────────────────
// In-memory cache with configurable TTL per key.
// Prevents repeated slow calls to OpenCode SDK and filesystem scans.

interface CacheEntry<T> {
    data: T
    expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const entry = store.get(key)

    if (entry && entry.expiresAt > now) {
        return Promise.resolve(entry.data as T)
    }

    return fetcher().then(data => {
        store.set(key, { data, expiresAt: now + ttlMs })
        return data
    })
}

export function invalidate(keyPrefix: string) {
    for (const key of store.keys()) {
        if (key.startsWith(keyPrefix)) {
            store.delete(key)
        }
    }
}

export function invalidateAll() {
    store.clear()
}

// Default TTLs
export const TTL = {
    ASSETS: 30_000,       // 30s — local files may change
    MCP_SERVERS: 30_000,  // 30s
    PROVIDERS: 60_000,    // 60s
} as const
