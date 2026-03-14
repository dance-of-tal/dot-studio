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
}

export type ChatSessionCreateRequest = {
    performerId: string
    performerName: string
    configHash: string
    executionMode?: ExecutionMode
}

export type ChatSessionCreateResponse = {
    sessionId: string
    title: string
}

export type ChatSendRequest = {
    message: string
    performer: {
        performerId: string
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
        description?: string
    }
    attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
    mentions?: Array<{ performerId: string }>
}
