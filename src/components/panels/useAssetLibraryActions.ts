import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../../api'
import { queryKeys, useInstallAsset } from '../../hooks/queries'
import { useStudioStore } from '../../store'
import { showToast } from '../../lib/toast'
import { slugifyAssetName } from '../../lib/performers'
import { isInstalledAssetKind, buildAuthoringPayloadFromAsset } from './asset-library-utils'
import type { InstalledKind } from './asset-library-utils'

export function useAssetLibraryActions(workingDir: string) {
    const performers = useStudioStore((state) => state.performers)
    const addPerformer = useStudioStore((state) => state.addPerformer)
    const createMarkdownEditor = useStudioStore((state) => state.createMarkdownEditor)
    const selectPerformer = useStudioStore((state) => state.selectPerformer)
    const setActiveChatPerformer = useStudioStore((state) => state.setActiveChatPerformer)
    const queryClient = useQueryClient()
    const installMutation = useInstallAsset()

    const invalidateInstalledAssetQueries = useCallback(async (kind: InstalledKind) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }, [queryClient, workingDir])

    const handleRegistryInstall = useCallback(async (urn: string, targetScope: 'global' | 'stage') => {
        return installMutation.mutateAsync({ urn, scope: targetScope })
    }, [installMutation])

    const createNewPerformerDraftEntry = useCallback((kind: 'tal' | 'dance', setAuthoringHint: (hint: string | null) => void) => {
        createMarkdownEditor(kind)
        setAuthoringHint(`Opened a new ${kind} editor on the canvas.`)
    }, [createMarkdownEditor])

    const createNewPerformer = useCallback((setAuthoringHint: (hint: string | null) => void) => {
        const beforeIds = new Set(performers.map((performer) => performer.id))
        addPerformer(`Performer ${performers.filter((performer) => performer.scope === 'shared').length + 1}`, 80, 80)
        const created = useStudioStore.getState().performers.find((performer) => !beforeIds.has(performer.id))
        if (created) {
            selectPerformer(created.id)
            setActiveChatPerformer(created.id)
            setAuthoringHint(`Created ${created.name}. Configure and publish it from the inspector.`)
        }
    }, [performers, addPerformer, selectPerformer, setActiveChatPerformer])

    const handlePinnedAssetAction = useCallback(async (
        asset: any,
        action: 'save-local' | 'publish',
        authUser: any,
        setDetailActionLoading: (v: null | 'save-local' | 'publish' | 'import') => void,
        setDetailActionStatus: (v: string | null) => void,
    ) => {
        if (!asset || !isInstalledAssetKind(asset.kind)) {
            return
        }

        try {
            setDetailActionLoading(action)
            setDetailActionStatus(null)
            const payload = buildAuthoringPayloadFromAsset(asset)
            const targetSlug = asset.slug || slugifyAssetName(asset.name)

            if (action === 'save-local') {
                if (!authUser?.username) {
                    throw new Error('Run dot login first to save a local fork under your namespace.')
                }
                const result = await api.dot.saveLocalAsset(asset.kind, targetSlug, payload, authUser.username)
                await invalidateInstalledAssetQueries(asset.kind)

                // Draft promotion: delete draft from disk after successful save
                if (asset.source === 'draft' && asset.draftId) {
                    api.drafts.delete(asset.kind, asset.draftId).catch(() => {})
                    useStudioStore.setState((s) => {
                        const next = { ...s.drafts }
                        delete next[asset.draftId]
                        return { drafts: next }
                    })
                }

                setDetailActionStatus(result.existed
                    ? `Updated local ${asset.kind} asset at ${result.urn}.`
                    : `Saved local ${asset.kind} asset at ${result.urn}.`)
                return
            }

            const result = await api.dot.publishAsset(asset.kind, targetSlug, payload, Array.isArray(asset.tags) ? asset.tags : [], true)
            await invalidateInstalledAssetQueries(asset.kind)
            setDetailActionStatus(result.published
                ? `Published ${result.urn}.`
                : `${result.urn} already exists in the registry.`)
        } catch (err: any) {
            setDetailActionStatus(err?.message || 'Asset action failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }, [invalidateInstalledAssetQueries])

    const handleDeleteDraft = useCallback(async (
        asset: any,
        setSelectedAsset: (v: any) => void,
    ) => {
        if (!asset?.draftId || !asset?.kind) return
        try {
            await api.drafts.delete(asset.kind, asset.draftId)
            useStudioStore.setState((s) => {
                const next = { ...s.drafts }
                delete next[asset.draftId]
                return { drafts: next }
            })
            setSelectedAsset(null)
            showToast(`Deleted draft "${asset.name}"`, 'success', {
                title: 'Draft deleted',
                dedupeKey: `draft:delete:${asset.draftId}`,
            })
        } catch (err: any) {
            showToast(err?.message || 'Failed to delete draft', 'error', {
                title: 'Delete failed',
                dedupeKey: `draft:delete-error:${asset.draftId}`,
            })
        }
    }, [])

    return {
        handleRegistryInstall,
        createNewPerformerDraftEntry,
        createNewPerformer,
        handlePinnedAssetAction,
        handleDeleteDraft,
    }
}
