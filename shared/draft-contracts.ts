// Draft CRUD — Shared contracts between client and server

import type { SharedAssetRef } from './chat-contracts.js'

export type DraftAssetKind = 'tal' | 'dance' | 'performer' | 'act'

/**
 * A draft file stored at `.dance-of-tal/drafts/<kind>/<id>.json`.
 * Drafts are project-local only — no global scope.
 *
 * @template T – The content type. Defaults to `unknown`;
 *   use `DraftFile<PerformerDraftContent>` etc. when you know the kind.
 */
export interface DraftFile<T = unknown> {
    id: string
    kind: DraftAssetKind
    name: string
    /** string for tal/dance markdown content; object for performer/act config */
    content: T
    slug?: string
    description?: string
    tags?: string[]
    /** Original URN if this draft was created by modifying a named asset */
    derivedFrom?: string | null
    createdAt: number
    updatedAt: number
    /** 1 = legacy single-file JSON, 2 = bundle directory (Dance only) */
    formatVersion?: number
}

/** Map from draft kind to its typed content */
export interface DraftContentMap {
    tal: string
    dance: string
    performer: PerformerDraftContent
    act: ActDraftContent
}

/** Convenience: typed DraftFile for a specific kind */
export type TypedDraftFile<K extends DraftAssetKind> = DraftFile<DraftContentMap[K]>

// ── Content shapes ──────────────────────────────────────

/**
 * Performer draft content shape (when DraftFile.kind === 'performer').
 */
export interface PerformerDraftContent {
    talRef: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null
    danceRefs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>
    model: { provider: string; modelId: string } | null
    modelVariant?: string | null
    mcpServerNames: string[]
    mcpBindingMap?: Record<string, string>
    danceDeliveryMode?: 'auto' | 'tool' | 'inline'
    planMode?: boolean
    agentId?: string | null
}

/**
 * Act draft content shape (when DraftFile.kind === 'act').
 * Participant choreography: no executionMode, no entry participant.
 */
export interface ActDraftContent {
    description?: string
    actRules?: string[]
    participants: Record<string, ActDraftParticipantBinding>
    relations: ActDraftRelation[]
}

export interface ActDraftParticipantBinding {
    performerRef: SharedAssetRef
    subscriptions?: {
        messagesFrom?: string[]
        messageTags?: string[]
        callboardKeys?: string[]
        eventTypes?: string[]
    }
}

/** Communication contract relation (between pair, not from/to) */
export interface ActDraftRelation {
    id: string
    between: [string, string]
    direction: 'both' | 'one-way'
    name: string
    description: string
}

// ── CRUD Request / Response types ────────────────────────

export interface CreateDraftRequest {
    kind: DraftAssetKind
    name: string
    content: unknown
    /** Optional: caller-specified ID. If omitted, generated server-side. */
    id?: string
    slug?: string
    description?: string
    tags?: string[]
    derivedFrom?: string | null
}

export interface UpdateDraftRequest {
    name?: string
    content?: unknown
    slug?: string
    description?: string
    tags?: string[]
    derivedFrom?: string | null
}

export interface DraftListResponse {
    drafts: DraftFile[]
}

export interface DraftResponse {
    draft: DraftFile
}

// ── Dance Bundle Types ──────────────────────────────────

export interface BundleTreeEntry {
    name: string
    type: 'file' | 'directory'
    /** Relative path from bundle root */
    path: string
    children?: BundleTreeEntry[]
}

export interface BundleFileReadResponse {
    path: string
    content: string
}

export interface BundleFileWriteRequest {
    path: string
    content: string
}

export interface BundleFileCreateRequest {
    path: string
    isDirectory?: boolean
}
