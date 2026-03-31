import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { assetUrnPath } from '../../lib/asset-urn'
import type { AssetPanelAsset, LibraryAsset } from './asset-panel-types'

function canonicalAssetPath(asset: AssetPanelAsset | null): string | null {
    if (!asset) return null
    const urnPath = typeof asset.urn === 'string' ? assetUrnPath(asset.urn) : null
    if (urnPath) return urnPath

    const fallbackPath = asset.slug || asset.name
    return typeof fallbackPath === 'string' && fallbackPath.includes('/')
        ? fallbackPath
        : null
}

function isFetchableAsset(asset: AssetPanelAsset | null): asset is LibraryAsset {
    return !!asset
        && (asset.kind === 'tal' || asset.kind === 'dance' || asset.kind === 'performer' || asset.kind === 'act')
        && asset.source !== 'draft'
        && typeof asset.author === 'string'
        && typeof asset.name === 'string'
        && !!canonicalAssetPath(asset)
}

export function useResolvedAssetDetail(asset: AssetPanelAsset | null) {
    const query = useQuery<LibraryAsset>({
        queryKey: ['asset-detail', asset?.kind, asset?.source, asset?.author, asset?.urn || asset?.slug || asset?.name],
        enabled: isFetchableAsset(asset),
        queryFn: async (): Promise<LibraryAsset> => {
            if (!isFetchableAsset(asset)) {
                throw new Error('Asset detail fetch requested for a non-fetchable asset.')
            }
            const author = asset.author.replace(/^@/, '')
            const path = canonicalAssetPath(asset)
            if (!path) {
                throw new Error('Asset detail requires canonical stage/name path information.')
            }
            const response = asset.source === 'stage' || asset.source === 'global'
                ? await api.assets.get(asset.kind, author, path)
                : await api.assets.getRegistry(asset.kind, author, path)
            return response as LibraryAsset
        },
        retry: false,
    })

    const resolvedAsset: AssetPanelAsset | null = query.data ?? asset

    return {
        resolvedAsset,
        loading: query.isLoading,
    }
}
