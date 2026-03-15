/**
 * DnD mapping logic extracted from App.tsx.
 *
 * Contains pure helper functions and types for drag-and-drop asset resolution
 * on the Studio canvas. These functions map dragged asset data to store
 * mutations without depending on React state.
 */

import type { AssetCard, AssetRef, StageActNode } from '../types'
import type { StudioState } from '../store'

// ── Types ───────────────────────────────────────────────

export type DragPreview = {
    kind: string;
    label: string;
};

export type DragAsset = Omit<Partial<AssetCard>, 'kind'> & {
    kind?: AssetCard['kind'];
    label?: string;
    source?: string;
    slug?: string;
    modelId?: string;
    semanticType?: string;
    value?: unknown;
    mcpConfig?: Record<string, unknown> | null;
    mcpBindingMap?: Record<string, string>;
};

export type DropTargetData = {
    type?: string;
    performerId?: string | null;
    editorId?: string;
    actId?: string;
    nodeId?: string;
};

export type PerformerAssetPayload = Parameters<StudioState['addPerformerFromAsset']>[0];
export type ActOwnedPerformerSeed = Parameters<StudioState['createActOwnedPerformerForNode']>[2];

// ── Helpers ─────────────────────────────────────────────

export function toDragPreview(asset: DragAsset): DragPreview {
    return {
        kind: asset?.kind || 'asset',
        label: asset?.label || asset?.name || asset?.modelId || 'Asset',
    };
}

export function assetRefFromDragAsset(asset: DragAsset): AssetRef | null {
    if (asset?.source === 'draft' && typeof asset.draftId === 'string') {
        return { kind: 'draft' as const, draftId: asset.draftId };
    }
    if (typeof asset?.urn === 'string' && asset.urn.length > 0) {
        return { kind: 'registry' as const, urn: asset.urn };
    }
    return null;
}

export function isInstalledAsset(asset: DragAsset) {
    return asset.source === 'stage' || asset.source === 'global';
}

export function getAssetAuthor(asset: DragAsset) {
    return String(asset.author || '').replace(/^@/, '');
}

export function getAssetSlug(asset: DragAsset) {
    return asset.slug || asset.name || '';
}

export function findActNode(store: StudioState, actId: string, nodeId: string) {
    const act = store.acts.find((item) => item.id === actId);
    const node = act?.nodes.find((item: StageActNode) => item.id === nodeId) || null;
    return { act, node };
}

export function ensureActNodePerformer(
    store: StudioState,
    actId: string,
    nodeId: string,
    seededAsset?: ActOwnedPerformerSeed,
) {
    const { act, node } = findActNode(store, actId, nodeId);
    if (!act || !node) {
        return null;
    }
    if (node.performerId) {
        return node.performerId;
    }
    return store.createActOwnedPerformerForNode(actId, nodeId, seededAsset || null);
}

// ── Asset → Performer applicators ───────────────────────

export function applyTalToPerformer(store: StudioState, performerId: string, asset: DragAsset) {
    const ref = assetRefFromDragAsset(asset);
    if (ref) {
        store.setPerformerTalRef(performerId, ref);
        return;
    }
    store.setPerformerTal(performerId, asset as AssetCard);
}

export function applyDanceToPerformer(store: StudioState, performerId: string, asset: DragAsset) {
    const ref = assetRefFromDragAsset(asset);
    if (ref) {
        store.addPerformerDanceRef(performerId, ref);
        return;
    }
    store.addPerformerDance(performerId, asset as AssetCard);
}

export function applyModelToPerformer(
    store: StudioState,
    performerId: string,
    asset: DragAsset,
    showDropWarning: (message: string) => void,
) {
    store.setPerformerModel(performerId, {
        provider: asset.provider as string,
        modelId: asset.modelId as string,
    });
    if (asset.connected === false) {
        showDropWarning(`${asset.providerName || asset.provider} is not connected in Settings yet. The performer can keep this model selection, but it will not run until provider access is configured.`);
    }
}

export function applyMcpToPerformer(store: StudioState, performerId: string, asset: DragAsset) {
    store.addPerformerMcp(performerId, asset as Parameters<StudioState['addPerformerMcp']>[1]);
}

export async function applyAssetToPerformerTarget(
    store: StudioState,
    performerId: string,
    dropType: string | undefined,
    asset: DragAsset,
    showDropWarning: (message: string) => void,
    resolvePerformerAssetForStudio: (asset: DragAsset) => Promise<PerformerAssetPayload>,
) {
    if (asset.kind === 'performer') {
        store.applyPerformerAsset(performerId, await resolvePerformerAssetForStudio(asset));
        return true;
    }

    if (dropType === 'tal' && asset.kind === 'tal') {
        applyTalToPerformer(store, performerId, asset);
        return true;
    }

    if (dropType === 'dance' && asset.kind === 'dance') {
        applyDanceToPerformer(store, performerId, asset);
        return true;
    }

    if (dropType === 'model' && asset.kind === 'model') {
        applyModelToPerformer(store, performerId, asset, showDropWarning);
        return true;
    }

    if (dropType === 'mcp' && asset.kind === 'mcp') {
        applyMcpToPerformer(store, performerId, asset);
        return true;
    }

    return false;
}
