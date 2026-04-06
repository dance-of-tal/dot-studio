// Performer runtime config resolution and hashing

import type { ModelConfig, PerformerNode } from '../types'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'
import {
    resolveMappedMcpServerNames,
    assetRefKey,
    assetRefKeys,
} from './performers-publish'

function hashString(value: string): string {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        h1 = Math.imul(h1 ^ code, 2654435761)
        h2 = Math.imul(h2 ^ code, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`
}

export function resolvePerformerAgentId(
    performer: Pick<PerformerNode, 'agentId' | 'planMode'>,
): string {
    return performer.agentId || (performer.planMode ? 'plan' : 'build')
}

export function resolvePerformerRuntimeConfig(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'planMode' | 'agentId'>,
) {
    return {
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
        mcpServerNames: resolveMappedMcpServerNames(performer),
        planMode: !!performer.planMode,
    }
}

export function buildPerformerConfigHash(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig' | 'planMode' | 'modelVariant' | 'agentId'> & {
        model: ModelConfig | null
    },
): string {
    const normalized = {
        talRef: assetRefKey(performer.talRef),
        danceRefs: [...assetRefKeys(performer.danceRefs)].sort(),
        mcpServerNames: [...resolveMappedMcpServerNames(performer)].sort(),
        mcpBindingMap: Object.fromEntries(
            Object.entries(performer.mcpBindingMap || {})
                .filter(([, value]) => !!value)
                .sort(([left], [right]) => left.localeCompare(right)),
        ),
        declaredMcpServerNames: extractMcpServerNamesFromConfig(performer.declaredMcpConfig),
        model: performer.model ? {
            provider: performer.model.provider,
            modelId: performer.model.modelId,
        } : null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
    }
    return `cfg_${hashString(JSON.stringify(normalized))}`
}
