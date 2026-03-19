// Performer node factory functions

import type {
    AssetRef,
    DanceDeliveryMode,
    ExecutionMode,
    ModelConfig,
    PerformerNode,
    PerformerScope,
} from '../types'
import {
    normalizePerformerAssetInput,
    sanitizeMcpBindingMap,
} from './performers-publish'

export function createPerformerNode(input: {
    id: string
    name: string
    x: number
    y: number
    scope?: PerformerScope
    talRef?: AssetRef | null
    danceRefs?: AssetRef[]
    model?: ModelConfig | null
    modelPlaceholder?: ModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, any> | null
    danceDeliveryMode?: DanceDeliveryMode
    executionMode?: ExecutionMode
    planMode?: boolean
    hidden?: boolean
    activeSessionId?: string
    meta?: {
        derivedFrom?: string | null
        publishBindingUrn?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}): PerformerNode {
    return {
        id: input.id,
        name: input.name,
        position: { x: input.x, y: input.y },
        width: 320,
        height: 400,
        scope: input.scope || 'shared',
        model: input.model || null,
        ...(input.modelPlaceholder ? { modelPlaceholder: input.modelPlaceholder } : {}),
        ...(input.modelVariant ? { modelVariant: input.modelVariant } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        talRef: input.talRef || null,
        danceRefs: input.danceRefs || [],
        mcpServerNames: Array.from(new Set(input.mcpServerNames || [])),
        mcpBindingMap: sanitizeMcpBindingMap(input.mcpBindingMap),
        declaredMcpConfig: input.declaredMcpConfig || null,
        danceDeliveryMode: input.danceDeliveryMode || 'auto',
        executionMode: input.executionMode || 'direct',
        ...(input.activeSessionId ? { activeSessionId: input.activeSessionId } : {}),
        ...(input.planMode ? { planMode: input.planMode } : {}),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
    }
}

export function createPerformerNodeFromAsset(input: {
    id: string
    asset: {
        name: string
        urn?: string | null
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
    }
    x: number
    y: number
    scope?: PerformerScope
    hidden?: boolean
}): PerformerNode {
    const normalized = normalizePerformerAssetInput(input.asset)
    return createPerformerNode({
        id: input.id,
        name: normalized.name,
        x: input.x,
        y: input.y,
        scope: input.scope,
        talRef: normalized.talRef,
        danceRefs: normalized.danceRefs,
        model: normalized.model,
        modelPlaceholder: normalized.modelPlaceholder,
        modelVariant: normalized.modelVariant,
        agentId: null,
        mcpServerNames: normalized.mcpServerNames,
        mcpBindingMap: normalized.mcpBindingMap,
        declaredMcpConfig: normalized.declaredMcpConfig,
        hidden: input.hidden,
        meta: normalized.meta,
    })
}

export function clonePerformerNode(input: {
    id: string
    source: PerformerNode
    x: number
    y: number
    scope?: PerformerScope
    hidden?: boolean
    name?: string
    carryPublishBinding?: boolean
    preserveAuthoring?: boolean
}): PerformerNode {
    const sourceUrn = input.source.meta?.publishBindingUrn
        || input.source.meta?.derivedFrom
        || null
    return createPerformerNode({
        id: input.id,
        name: input.name || input.source.name,
        x: input.x,
        y: input.y,
        scope: input.scope || input.source.scope,
        talRef: input.source.talRef,
        danceRefs: input.source.danceRefs,
        model: input.source.model,
        modelPlaceholder: input.source.modelPlaceholder || null,
        modelVariant: input.source.modelVariant || null,
        agentId: input.source.agentId || null,
        mcpServerNames: input.source.mcpServerNames,
        mcpBindingMap: input.source.mcpBindingMap,
        declaredMcpConfig: input.source.declaredMcpConfig,
        danceDeliveryMode: input.source.danceDeliveryMode,
        planMode: input.source.planMode,
        hidden: input.hidden ?? input.source.hidden,
        meta: {
            ...(sourceUrn ? { derivedFrom: sourceUrn } : {}),
            ...(input.carryPublishBinding && sourceUrn ? { publishBindingUrn: sourceUrn } : {}),
            ...(input.preserveAuthoring && input.source.meta?.authoring ? { authoring: input.source.meta.authoring } : {}),
        },
    })
}
