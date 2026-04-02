import type { McpServer } from '../../types'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { LibraryAsset } from './asset-panel-types'

// Drag payload builders for the Asset Library

export function buildInstalledAssetDragPayload(asset: LibraryAsset) {
    // Performer-specific payload (installed or draft)
    if (asset.kind === 'performer') {
        if (asset.source === 'draft') {
            return {
                kind: 'performer',
                urn: asset.urn,
                draftId: asset.draftId,
                source: asset.source,
                name: asset.name,
                author: asset.author,
                draftContent: asset.draftContent ?? undefined,
            }
        }
        return {
            kind: 'performer',
            urn: asset.urn,
            name: asset.name,
            author: asset.author,
            source: asset.source,
            talUrn: asset.talUrn || null,
            danceUrns: Array.isArray(asset.danceUrns) ? asset.danceUrns : [],
            model: asset.model || null,
            modelVariant: asset.modelVariant || null,
            mcpConfig: asset.mcpConfig || null,
            declaredMcpServerNames: Array.isArray(asset.declaredMcpServerNames) ? asset.declaredMcpServerNames : [],
            matchedMcpServerNames: Array.isArray(asset.matchedMcpServerNames) ? asset.matchedMcpServerNames : [],
            missingMcpServerNames: Array.isArray(asset.missingMcpServerNames) ? asset.missingMcpServerNames : [],
        }
    }

    // Act-specific payload (installed or draft)
    if (asset.kind === 'act') {
        if (asset.source === 'draft') {
            return {
                kind: 'act',
                urn: asset.urn,
                draftId: asset.draftId,
                source: asset.source,
                name: asset.name,
                author: asset.author,
                draftContent: asset.draftContent ?? undefined,
            }
        }
        return {
            kind: 'act',
            urn: asset.urn,
            slug: asset.slug,
            name: asset.name,
            author: asset.author,
            source: asset.source,
            description: asset.description || '',
            actRules: Array.isArray(asset.actRules) ? asset.actRules : [],
            participants: Array.isArray(asset.participants) ? asset.participants : [],
            relations: Array.isArray(asset.relations) ? asset.relations : [],
        }
    }

    // Generic draft payload (tal/dance drafts)
    if (asset.source === 'draft') {
        return {
            kind: asset.kind,
            urn: asset.urn,
            draftId: asset.draftId,
            source: asset.source,
            name: asset.name,
            author: asset.author,
        }
    }

    // Generic installed payload (tal/dance)
    return {
        kind: asset.kind,
        urn: asset.urn,
        slug: asset.slug,
        name: asset.name,
        author: asset.author,
        source: asset.source,
    }
}

export function buildModelDragPayload(model: RuntimeModelCatalogEntry) {
    return {
        kind: 'model',
        provider: model.provider,
        providerName: model.providerName || model.provider,
        modelId: model.id,
        name: model.name || model.id,
        connected: !!model.connected,
    }
}

export function buildMcpDragPayload(mcp: McpServer) {
    return {
        kind: 'mcp',
        name: mcp.name,
        status: mcp.status,
        tools: Array.isArray(mcp.tools) ? mcp.tools : [],
        resources: Array.isArray(mcp.resources) ? mcp.resources : [],
    }
}
