// Projection-based runtime no longer assembles prompts inline.
// This module intentionally only exposes shared runtime selection types that
// are still consumed across the server.

export type DanceDeliveryMode = 'auto' | 'tool' | 'inline'

export type ModelSelection = {
    provider: string
    modelId: string
} | null
