// Performer utilities barrel re-export
// This file serves as the public API for performer-related utilities.

import type { DraftAsset } from '../types'

export {
    assetCardFromUrn,
    assetRefKey,
    assetRefKeys,
    buildActAssetPayload,
    buildAssetCardMap,
    buildAutoMcpBindingMap,
    buildMcpServerMap,
    buildPerformerAssetPayload,
    isSameAssetRef,
    normalizePerformerAssetInput,
    performerMcpConfigForAsset,
    registryAssetRef,
    registryAssetRefs,
    registryUrnFromRef,
    registryUrnsFromRefs,
    resolveMappedMcpServerNames,
    resolvePerformerPresentation,
    sanitizeMcpBindingMap,
    slugifyAssetName,
    unresolvedDeclaredMcpServerNames,
} from './performers-publish'

export {
    modelConfigFromAssetValue,
    hasModelConfig,
    resolveImportedModel,
    normalizeAssetModelForStudio,
    normalizeAssetMcpForStudio,
    modelConfigToAssetValue,
} from './performers-model'

export {
    createPerformerNode,
    createPerformerNodeFromAsset,
    clonePerformerNode,
} from './performers-node'

export {
    resolvePerformerAgentId,
    resolvePerformerRuntimeConfig,
    buildPerformerConfigHash,
} from './performers-runtime'

export function draftTextContent(draft: DraftAsset | null | undefined): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.content === 'string') {
        return draft.content
    }
    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.content === 'string') {
            return content.content
        }
        if (typeof content.body === 'string') {
            return content.body
        }
    }
    return ''
}

export function draftTags(draft: DraftAsset | null | undefined): string[] {
    return Array.isArray(draft?.tags)
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : []
}
