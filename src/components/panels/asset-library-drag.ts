// Drag payload builders for the Asset Library

export function buildInstalledAssetDragPayload(asset: any) {
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

    if (asset.kind === 'performer') {
        return {
            kind: 'performer',
            urn: asset.urn,
            name: asset.name,
            author: asset.author,
            talUrn: asset.talUrn || null,
            danceUrns: Array.isArray(asset.danceUrns) ? asset.danceUrns : [],
            model: asset.model || null,
            modelVariant: asset.modelVariant || null,
            mcpConfig: asset.mcpConfig || null,
            declaredMcpServerNames: Array.isArray(asset.declaredMcpServerNames) ? asset.declaredMcpServerNames : [],
            projectMcpMatches: Array.isArray(asset.projectMcpMatches) ? asset.projectMcpMatches : [],
            projectMcpMissing: Array.isArray(asset.projectMcpMissing) ? asset.projectMcpMissing : [],
        }
    }

    return {
        kind: asset.kind,
        urn: asset.urn,
        slug: asset.slug,
        name: asset.name,
        author: asset.author,
        source: asset.source,
    }
}

export function buildModelDragPayload(model: any) {
    return {
        kind: 'model',
        provider: model.provider,
        providerName: model.providerName || model.provider,
        modelId: model.id,
        name: model.name || model.id,
        connected: !!model.connected,
    }
}

export function buildMcpDragPayload(mcp: any) {
    return {
        kind: 'mcp',
        name: mcp.name,
        status: mcp.status,
        tools: Array.isArray(mcp.tools) ? mcp.tools : [],
        resources: Array.isArray(mcp.resources) ? mcp.resources : [],
    }
}
