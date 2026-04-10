import { describe, expect, it } from 'vitest';
import { readStartupAssetTarget } from './startup-asset-target';

describe('readStartupAssetTarget', () => {
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
});
