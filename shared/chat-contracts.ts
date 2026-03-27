import type { ExecutionMode } from './safe-mode.js'
import type { AssistantStageContext } from './assistant-actions.js'

export type SharedAssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

export type CompilePromptRequest = {
    performerId?: string
    performerName?: string
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    model: {
        provider: string
        modelId: string
    } | null
    modelVariant?: string | null
    agentId?: string | null
    mcpServerNames?: string[]
    planMode?: boolean
    danceDeliveryMode?: 'auto' | 'tool' | 'inline'
    requestTargets?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
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
    actId?: string
    /** Thread within Act — used for choreography runtime context */
    actThreadId?: string
    assistantContext?: AssistantStageContext | null
}
