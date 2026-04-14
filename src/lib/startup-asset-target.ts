import type { AssetCard, PerformerNode, WorkspaceAct } from '../types';
import { formatStudioApiErrorMessage } from './api-errors';

export type StartupAssetTarget =
    | { kind: 'performer'; urn: string }
    | { kind: 'act'; urn: string };

export function readStartupAssetTarget(search: string): StartupAssetTarget | null {
    const params = new URLSearchParams(search);
    const performerUrn = params.get('performer')?.trim() || '';
    const actUrn = params.get('act')?.trim() || '';

    if (performerUrn && actUrn) {
        return null;
    }

    if (performerUrn) {
        return { kind: 'performer', urn: performerUrn };
    }

    if (actUrn) {
        return { kind: 'act', urn: actUrn };
    }

    return null;
}

export function clearStartupAssetTargetFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('performer');
    url.searchParams.delete('act');
    const search = url.searchParams.toString();
    const nextUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
}

async function loadStartupRuntime() {
    const [{ api }, { useStudioStore }, { showToast }] = await Promise.all([
        import('../api'),
        import('../store'),
        import('./toast'),
    ]);

    return { api, useStudioStore, showToast };
}

function findPerformerByUrn(
    useStudioStore: { getState: () => { performers: PerformerNode[] } },
    urn: string,
): PerformerNode | null {
    const performers = useStudioStore.getState().performers;
    return [...performers].reverse().find((performer) => performer.meta?.derivedFrom === urn) || null;
}

function findActByUrn(
    useStudioStore: { getState: () => { acts: WorkspaceAct[] } },
    urn: string,
): WorkspaceAct | null {
    const acts = useStudioStore.getState().acts;
    return [...acts].reverse().find((act) => act.meta?.derivedFrom === urn) || null;
}

async function findInstalledAssetByUrn(
    api: { assets: { list: (kind: string) => Promise<Array<Record<string, unknown>>> } },
    kind: 'performer' | 'act',
    urn: string,
): Promise<AssetCard | null> {
    const assets = await api.assets.list(kind);
    const asset = assets.find((entry) => typeof entry?.urn === 'string' && entry.urn === urn);
    return (asset as AssetCard | undefined) || null;
}

function focusPerformer(
    useStudioStore: {
        getState: () => {
            selectPerformer: (performerId: string) => void
            revealCanvasNode: (nodeId: string, nodeType: 'performer' | 'act') => void
        }
    },
    performerId: string,
) {
    const store = useStudioStore.getState();
    store.selectPerformer(performerId);
    store.revealCanvasNode(performerId, 'performer');
}

function focusAct(
    useStudioStore: {
        getState: () => {
            selectAct: (actId: string) => void
            revealCanvasNode: (nodeId: string, nodeType: 'performer' | 'act') => void
        }
    },
    actId: string,
) {
    const store = useStudioStore.getState();
    store.selectAct(actId);
    store.revealCanvasNode(actId, 'act');
}

function showMissingAssetToast(
    showToast: (message: string, kind: 'info' | 'success' | 'error' | 'warning', options?: Record<string, unknown>) => void,
    target: StartupAssetTarget,
) {
    showToast(
        `Studio could not find installed ${target.kind} asset ${target.urn}.`,
        'error',
        {
            title: `${target.kind === 'performer' ? 'Performer' : 'Act'} not found`,
            dedupeKey: `startup-asset-missing:${target.kind}:${target.urn}`,
        },
    );
}

function showInstallFailedToast(
    showToast: (message: string, kind: 'info' | 'success' | 'error' | 'warning', options?: Record<string, unknown>) => void,
    target: StartupAssetTarget,
    error: unknown,
) {
    showToast(
        `Studio could not install ${target.kind} asset ${target.urn} from the registry. ${formatStudioApiErrorMessage(error, false)}`,
        'error',
        {
            title: `${target.kind === 'performer' ? 'Performer' : 'Act'} install failed`,
            dedupeKey: `startup-asset-install-failed:${target.kind}:${target.urn}`,
        },
    );
}

async function ensureInstalledAssetByUrn(
    api: {
        assets: { list: (kind: string) => Promise<Array<Record<string, unknown>>> }
        dot: { install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') => Promise<unknown> }
    },
    showToast: (message: string, kind: 'info' | 'success' | 'error' | 'warning', options?: Record<string, unknown>) => void,
    target: StartupAssetTarget,
): Promise<AssetCard | null> {
    const installedAsset = await findInstalledAssetByUrn(api, target.kind, target.urn);
    if (installedAsset) {
        return installedAsset;
    }

    try {
        await api.dot.install(target.urn, undefined, false, 'stage');
    } catch (error) {
        showInstallFailedToast(showToast, target, error);
        return null;
    }

    const installedAfterFetch = await findInstalledAssetByUrn(api, target.kind, target.urn);
    if (!installedAfterFetch) {
        showMissingAssetToast(showToast, target);
        return null;
    }

    return installedAfterFetch;
}

export async function openStartupAssetTarget(target: StartupAssetTarget): Promise<boolean> {
    const { api, useStudioStore, showToast } = await loadStartupRuntime();

    if (target.kind === 'performer') {
        const existing = findPerformerByUrn(useStudioStore, target.urn);
        if (existing) {
            focusPerformer(useStudioStore, existing.id);
            return true;
        }

        const asset = await ensureInstalledAssetByUrn(api, showToast, target);
        if (!asset) {
            return false;
        }

        const { loadPerformerImportContext, normalizeImportedPerformerAsset } = await import('./performer-import');
        const context = await loadPerformerImportContext();
        useStudioStore.getState().addPerformerFromAsset(normalizeImportedPerformerAsset(asset, context));
        const created = findPerformerByUrn(useStudioStore, target.urn);
        if (created) {
            focusPerformer(useStudioStore, created.id);
        }
        return true;
    }

    const existing = findActByUrn(useStudioStore, target.urn);
    if (existing) {
        focusAct(useStudioStore, existing.id);
        return true;
    }

    const asset = await ensureInstalledAssetByUrn(api, showToast, target);
    if (!asset) {
        return false;
    }

    await useStudioStore.getState().importActFromAsset(asset);
    const created = findActByUrn(useStudioStore, target.urn);
    if (created) {
        focusAct(useStudioStore, created.id);
    }
    return true;
}
