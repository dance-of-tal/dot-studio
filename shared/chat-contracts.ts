import type { ExecutionMode } from './safe-mode.js'

export type SharedAssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

export type SharedDraftAsset = {
    id: string
    kind: 'tal' | 'dance' | 'performer' | 'act'
    name: string
    content: unknown
    description?: string
    derivedFrom?: string | null
}

export type CompilePromptRequest = {
    performerId?: string
    performerName?: string
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    drafts?: Record<string, SharedDraftAsset>
    model: {
        provider: string
        modelId: string
    } | null
    modelVariant?: string | null
    agentId?: string | null
    mcpServerNames?: string[]
    planMode?: boolean
    danceDeliveryMode?: 'auto' | 'tool' | 'inline'
    relatedPerformers?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
}

export type ChatSessionCreateRequest = {
    performerId: string
    performerName: string
    configHash: string
    executionMode?: ExecutionMode
    actId?: string
}

export type ChatSessionCreateResponse = {
    sessionId: string
    title: string
}

export type ChatSendRequest = {
    message: string
    performer: {
        performerId: string
        performerName: string
        talRef: SharedAssetRef | null
        danceRefs: SharedAssetRef[]
        extraDanceRefs?: SharedAssetRef[]
        drafts?: Record<string, SharedDraftAsset>
        model?: {
            provider: string
            modelId: string
        } | null
        modelVariant?: string | null
        agentId?: string | null
        mcpServerNames?: string[]
        danceDeliveryMode?: 'auto' | 'tool' | 'inline'
        planMode?: boolean
        configHash?: string
    }
    attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
    mentions?: Array<{ performerId: string }>
    actId?: string
    relatedPerformers?: Array<{
        performerId: string
        performerName: string
        description?: string
        talRef: SharedAssetRef | null
        danceRefs: SharedAssetRef[]
        drafts?: Record<string, SharedDraftAsset>
        model?: {
            provider: string
            modelId: string
        } | null
        modelVariant?: string | null
        mcpServerNames?: string[]
        /** Outgoing edge targets of this related performer (for multi-depth task chaining). */
        relatedPerformerIds?: Array<{
            performerId: string
            performerName: string
            description?: string
        }>
    }>
}
