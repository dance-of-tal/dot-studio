import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    listAssetsMock,
    installMock,
    showToastMock,
    formatStudioApiErrorMessageMock,
    storeStateRef,
} = vi.hoisted(() => ({
    listAssetsMock: vi.fn(),
    installMock: vi.fn(),
    showToastMock: vi.fn(),
    formatStudioApiErrorMessageMock: vi.fn(),
    storeStateRef: {
        current: null as {
            acts: Array<{ id: string; meta?: { derivedFrom?: string | null } }>
            performers: Array<{ id: string; meta?: { derivedFrom?: string | null } }>
            selectAct: ReturnType<typeof vi.fn>
            selectPerformer: ReturnType<typeof vi.fn>
            revealCanvasNode: ReturnType<typeof vi.fn>
            importActFromAsset: ReturnType<typeof vi.fn>
            addPerformerFromAsset: ReturnType<typeof vi.fn>
        } | null,
    },
}));

vi.mock('../api', () => ({
    api: {
        assets: {
            list: listAssetsMock,
        },
        dot: {
            install: installMock,
        },
    },
}));

vi.mock('../store', () => ({
    useStudioStore: {
        getState: () => storeStateRef.current,
    },
}));

vi.mock('./toast', () => ({
    showToast: showToastMock,
}));

vi.mock('./api-errors', () => ({
    formatStudioApiErrorMessage: formatStudioApiErrorMessageMock,
}));

import { openStartupAssetTarget, readStartupAssetTarget } from './startup-asset-target';

describe('readStartupAssetTarget', () => {
    beforeEach(() => {
        listAssetsMock.mockReset();
        installMock.mockReset();
        showToastMock.mockReset();
        formatStudioApiErrorMessageMock.mockReset().mockImplementation((error: unknown) =>
            error instanceof Error ? error.message : String(error),
        );
        storeStateRef.current = {
            acts: [],
            performers: [],
            selectAct: vi.fn(),
            selectPerformer: vi.fn(),
            revealCanvasNode: vi.fn(),
            importActFromAsset: vi.fn(async (asset: { urn: string }) => {
                storeStateRef.current?.acts.push({
                    id: 'act-1',
                    meta: { derivedFrom: asset.urn },
                });
            }),
            addPerformerFromAsset: vi.fn((asset: { urn: string }) => {
                storeStateRef.current?.performers.push({
                    id: 'performer-1',
                    meta: { derivedFrom: asset.urn },
                });
            }),
        };
    });

    it('reads performer targets from search params', () => {
        expect(readStartupAssetTarget('?performer=performer/@acme/workflows/reviewer')).toEqual({
            kind: 'performer',
            urn: 'performer/@acme/workflows/reviewer',
        });
    });

    it('reads act targets from search params', () => {
        expect(readStartupAssetTarget('?act=act/@acme/workflows/review-flow')).toEqual({
            kind: 'act',
            urn: 'act/@acme/workflows/review-flow',
        });
    });

    it('returns null when neither startup asset param is present', () => {
        expect(readStartupAssetTarget('?foo=bar')).toBeNull();
    });

    it('returns null for ambiguous URLs that include both performer and act', () => {
        expect(readStartupAssetTarget('?performer=performer/@acme/workflows/reviewer&act=act/@acme/workflows/review-flow')).toBeNull();
    });

    it('installs a missing startup act from the registry before importing it', async () => {
        const urn = 'act/@monarchjuno/ai-invest/asset-management-team';
        const asset = {
            kind: 'act',
            urn,
            name: 'asset-management-team',
            author: '@monarchjuno',
            source: 'stage',
            participants: [],
            relations: [],
        };

        listAssetsMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([asset]);
        installMock.mockResolvedValue({ ok: true });

        await expect(openStartupAssetTarget({ kind: 'act', urn })).resolves.toBe(true);

        expect(installMock).toHaveBeenCalledWith(urn, undefined, false, 'stage');
        expect(storeStateRef.current?.importActFromAsset).toHaveBeenCalledWith(asset);
        expect(storeStateRef.current?.selectAct).toHaveBeenCalledWith('act-1');
        expect(storeStateRef.current?.revealCanvasNode).toHaveBeenCalledWith('act-1', 'act');
        expect(showToastMock).not.toHaveBeenCalled();
    });

    it('shows an install error toast when registry install fails for a startup act', async () => {
        const urn = 'act/@monarchjuno/ai-invest/asset-management-team';

        listAssetsMock.mockResolvedValueOnce([]);
        installMock.mockRejectedValue(new Error('Registry package not found.'));

        await expect(openStartupAssetTarget({ kind: 'act', urn })).resolves.toBe(false);

        expect(showToastMock).toHaveBeenCalledWith(
            `Studio could not install act asset ${urn} from the registry. Registry package not found.`,
            'error',
            expect.objectContaining({
                title: 'Act install failed',
                dedupeKey: `startup-asset-install-failed:act:${urn}`,
            }),
        );
        expect(storeStateRef.current?.importActFromAsset).not.toHaveBeenCalled();
    });
});
