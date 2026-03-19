/**
 * DnD mapping logic extracted from App.tsx.
 *
 * Contains pure helper functions and types for drag-and-drop asset resolution
 * on the Studio canvas. These functions map dragged asset data to store
 * mutations without depending on React state.
 */

import type { AssetCard, AssetRef } from '../types'
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
    declaredMcpServerNames?: string[];
    projectMcpMatches?: string[];
    projectMcpMissing?: string[];
    /** Structured draft content for performer/act drafts */
    draftContent?: unknown;
};

export type DropTargetData = {
    type?: string;
    performerId?: string | null;
    actId?: string | null;
    editorId?: string;
};

export type PerformerAssetPayload = Parameters<StudioState['addPerformerFromAsset']>[0];

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

// ── Act Participant applicators ─────────────────────────

/**
 * Detect whether a drop target belongs to an Act participant.
 * Act participant droppable IDs use the format `act-perf-{type}-act-p-{key}`.
 */
export function parseActParticipantDropId(dropId: string): { participantKey: string } | null {
    const match = dropId.match(/^act-perf-\w+-act-p-(.+)$/)
    return match ? { participantKey: match[1] } : null
}

/**
 * Apply an asset drop to an Act participant binding.
 * In the choreography model, Act participants are refs — we can only bind performer refs.
 * Direct config drops (tal, dance, model, mcp) are not supported on Act participant bindings.
 */
export function applyAssetToActParticipant(
    store: StudioState,
    actId: string,
    _participantKey: string,
    _dropType: string | undefined,
    asset: DragAsset,
    _showDropWarning: (message: string) => void,
): boolean {
    if (asset.kind === 'performer') {
        // In choreography model, bind performer ref to act
        const ref = assetRefFromDragAsset(asset)
        if (ref) {
            store.attachPerformerRefToAct(actId, ref)
        }
        return true
    }

    // Other asset types (tal, dance, model, mcp) cannot be directly applied
    // to Act participant bindings in the choreography model — they're ref-based
    return false
}
