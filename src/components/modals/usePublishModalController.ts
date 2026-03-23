import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { buildActAssetPayload, buildPerformerAssetPayload, slugifyAssetName } from '../../lib/performers'
import { queryKeys } from '../../hooks/queries'
import { useDotLogin } from '../../hooks/useDotLogin'
import {
    buildMarkdownAssetPayload,
    buildPerformerPreflight,
    buildPickerItems,
    getActPublishBlockReasons,
    parseTags,
} from './publish-modal-utils'
import type { PickerItem } from './publish-modal-utils'

export function usePublishModalController(open: boolean) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const drafts = useStudioStore((state) => state.drafts)
    const markdownEditors = useStudioStore((state) => state.markdownEditors)
    const acts = useStudioStore((state) => state.acts)

    const updatePerformerAuthoringMeta = useStudioStore((state) => state.updatePerformerAuthoringMeta)
    const updateMarkdownEditorBaseline = useStudioStore((state) => state.updateMarkdownEditorBaseline)
    const upsertDraft = useStudioStore((state) => state.upsertDraft)
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef)
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef)
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef)

    const queryClient = useQueryClient()
    const { authUser, startLogin, isAuthenticating } = useDotLogin()

    const [step, setStep] = useState<'picker' | 'form'>('picker')
    const [pickerSelection, setPickerSelection] = useState<PickerItem | null>(null)
    const [slug, setSlug] = useState('')
    const [description, setDescription] = useState('')
    const [tagsText, setTagsText] = useState('')
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null)
    const [action, setAction] = useState<null | 'save-local' | 'publish'>(null)
    const performer = pickerSelection?.kind === 'performer'
        ? performers.find((p) => p.id === pickerSelection.performerId) || null
        : null
    const markdownEditor = pickerSelection?.source === 'draft'
        ? markdownEditors.find((e) => e.id === pickerSelection.editorId) || null
        : null
    const draft = markdownEditor ? drafts[markdownEditor.draftId] || null : null
    const isLocalAsset = pickerSelection?.source === 'local'
    const selectedAct = pickerSelection?.kind === 'act'
        ? acts.find((a) => a.id === pickerSelection.actId) || null
        : null

    const target = performer
        ? { kind: 'performer' as const, id: performer.id, name: performer.name }
        : selectedAct
            ? { kind: 'act' as const, id: selectedAct.id, name: selectedAct.name }
            : markdownEditor && draft
                ? { kind: markdownEditor.kind, id: markdownEditor.id, name: draft.name || `${markdownEditor.kind} draft` }
                : isLocalAsset && pickerSelection
                    ? { kind: pickerSelection.kind, id: pickerSelection.urn, name: pickerSelection.name }
                    : null

    const pickerItems = useMemo(() => buildPickerItems({
        installedTals: [],
        installedDances: [],
        markdownEditors,
        drafts,
        performers,
        acts,
    }), [markdownEditors, drafts, performers, acts])

    useEffect(() => {
        if (open) {
            setStep('picker')
            setPickerSelection(null)
            setStatus(null)
        }
    }, [open])

    useEffect(() => {
        if (step !== 'form' || !pickerSelection) return
        setStatus(null)

        if (performer) {
            setSlug(performer.meta?.authoring?.slug || slugifyAssetName(performer.name))
            setDescription(performer.meta?.authoring?.description || performer.name)
            setTagsText((performer.meta?.authoring?.tags || []).join(', '))
            return
        }
        if (draft) {
            setSlug(draft.slug || slugifyAssetName(draft.name))
            setDescription(draft.description || draft.name)
            setTagsText((draft.tags || []).join(', '))
            return
        }
        if (isLocalAsset && pickerSelection && pickerSelection.source === 'local') {
            setSlug(pickerSelection.slug)
            setDescription(pickerSelection.name)
            setTagsText('')
        }
    }, [step, pickerSelection, performer, draft, isLocalAsset])

    const performerPreflight = useMemo(() => buildPerformerPreflight(performer), [performer])

    const markdownDirty = useMemo(() => {
        if (!markdownEditor || !draft) return false
        const baseline = markdownEditor.baseline
        if (!baseline) return true
        return baseline.name !== draft.name
            || (baseline.slug || '') !== (draft.slug || '')
            || (baseline.description || '') !== (draft.description || '')
            || JSON.stringify(baseline.tags || []) !== JSON.stringify(draft.tags || [])
            || baseline.content !== draft.content
    }, [draft, markdownEditor])

    const performerHasBlockingDependencies = useMemo(
        () => performerPreflight.some((entry) => entry.status !== 'ready'),
        [performerPreflight],
    )
    const publishBlockedReason = useMemo(() => {
        if (performer && performerHasBlockingDependencies) {
            return 'Save Tal and Dance dependencies as local or published assets before exporting this performer.'
        }
        if (selectedAct) {
            const actBlockReasons = getActPublishBlockReasons(selectedAct)
            if (actBlockReasons.length > 0) {
                return actBlockReasons.join(' ')
            }
        }
        return null
    }, [performer, performerHasBlockingDependencies, selectedAct])

    const canSaveOrPublish = !!target
        && !!slug.trim()
        && (!markdownEditor || markdownDirty)
        && !publishBlockedReason
        && !!authUser?.authenticated

    const invalidateKind = async (kind: 'tal' | 'dance' | 'performer' | 'act') => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }

    const syncMarkdownDraftPublishState = (
        resultUrn: string,
        nextSlug: string,
        payload: ReturnType<typeof buildMarkdownAssetPayload>,
    ) => {
        if (!markdownEditor || !draft) return

        upsertDraft({
            ...draft,
            slug: nextSlug,
            description: payload.description,
            tags: payload.tags,
            derivedFrom: resultUrn,
            updatedAt: Date.now(),
        })
        updateMarkdownEditorBaseline(markdownEditor.id, {
            name: draft.name,
            slug: nextSlug,
            description: payload.description,
            tags: payload.tags,
            content: payload.content,
        })

        if (!markdownEditor.attachTarget?.performerId) return

        const nextRef = { kind: 'registry' as const, urn: resultUrn }
        if (markdownEditor.attachTarget.mode === 'tal') {
            setPerformerTalRef(markdownEditor.attachTarget.performerId, nextRef)
        } else if (markdownEditor.attachTarget.mode === 'dance-new' && !markdownEditor.attachTarget.targetRef) {
            addPerformerDanceRef(markdownEditor.attachTarget.performerId, nextRef)
        } else if (markdownEditor.attachTarget.targetRef) {
            replacePerformerDanceRef(markdownEditor.attachTarget.performerId, markdownEditor.attachTarget.targetRef, nextRef)
        }
    }

    const handleSaveLocal = async () => {
        if (!target) return
        try {
            setAction('save-local')
            setStatus(null)
            const tags = parseTags(tagsText)

            if (target.kind === 'performer' && performer) {
                updatePerformerAuthoringMeta(performer.id, { slug, description, tags })
                const payload = buildPerformerAssetPayload(performer, {
                    name: performer.name,
                    description,
                    tags,
                })
                const result = await api.dot.saveLocalAsset('performer', slug, payload, authUser?.username || undefined)
                await invalidateKind('performer')
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local performer asset at ${result.urn}.` : `Saved local performer asset at ${result.urn}.`,
                })
                return
            }

            if (target.kind === 'act' && selectedAct) {
                const payload = buildActAssetPayload(selectedAct, { description, tags })
                const result = await api.dot.saveLocalAsset('act', slug, payload, authUser?.username || undefined)
                await invalidateKind('act')
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local act asset at ${result.urn}.` : `Saved local act asset at ${result.urn}.`,
                })
                return
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && markdownEditor && draft) {
                const payload = buildMarkdownAssetPayload(markdownEditor, draft, slug, description, tags)
                const result = await api.dot.saveLocalAsset(markdownEditor.kind, slug, payload, authUser?.username || undefined)
                syncMarkdownDraftPublishState(result.urn, slug, payload)
                await invalidateKind(markdownEditor.kind)
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local ${markdownEditor.kind} asset at ${result.urn}.` : `Saved local ${markdownEditor.kind} asset at ${result.urn}.`,
                })
                return
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && isLocalAsset) {
                setStatus({ tone: 'success', message: `${target.kind}/${target.id} is already saved locally.` })
            }
        } catch (error: unknown) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setAction(null)
        }
    }

    const handlePublish = async () => {
        if (!target) return
        try {
            setAction('publish')
            setStatus(null)
            const tags = parseTags(tagsText)

            if (target.kind === 'performer' && performer) {
                updatePerformerAuthoringMeta(performer.id, { slug, description, tags })
                const payload = buildPerformerAssetPayload(performer, {
                    name: performer.name,
                    description,
                    tags,
                })
                const result = await api.dot.publishAsset('performer', slug, payload, tags, true)
                await invalidateKind('performer')
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                })
                return
            }

            if (target.kind === 'act' && selectedAct) {
                const payload = buildActAssetPayload(selectedAct, { description, tags })
                const result = await api.dot.publishAsset('act', slug, payload, tags, true)
                await invalidateKind('act')
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                })
                return
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && markdownEditor && draft) {
                const payload = buildMarkdownAssetPayload(markdownEditor, draft, slug, description, tags)
                const result = await api.dot.publishAsset(markdownEditor.kind, slug, payload, tags, true)
                syncMarkdownDraftPublishState(result.urn, slug, payload)
                await invalidateKind(markdownEditor.kind)
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                })
                return
            }

            if ((target.kind === 'tal' || target.kind === 'dance') && isLocalAsset) {
                const result = await api.dot.publishAsset(target.kind, slug, undefined, tags, true)
                await invalidateKind(target.kind)
                setStatus({
                    tone: 'success',
                    message: result.published ? `Published ${result.urn}.` : `${result.urn} already exists in the registry.`,
                })
            }
        } catch (error: unknown) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setAction(null)
        }
    }

    return {
        authUser,
        isAuthenticating,
        startLogin,
        step,
        setStep,
        pickerSelection,
        setPickerSelection,
        target,
        slug,
        setSlug,
        description,
        setDescription,
        tagsText,
        setTagsText,
        status,
        action,
        pickerItems,
        performerPreflight,
        markdownEditor,
        markdownDirty,
        draft,
        publishBlockedReason,
        canSaveOrPublish,
        isLocalAsset,
        handleSaveLocal,
        handlePublish,
        handlePickItem: (item: PickerItem) => {
            setPickerSelection(item)
            setStep('form')
        },
        handleBack: () => {
            setStep('picker')
            setPickerSelection(null)
            setStatus(null)
        },
    }
}
