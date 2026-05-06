import type {
    AssistantAction,
    AssistantActRelationBlueprint,
    AssistantDraftBlueprint,
    AssistantParticipantSubscriptionsInput,
    AssistantPerformerFields,
    AssistantStudioNodeType,
} from '../../../shared/assistant-actions'
import { normalizeAssistantBundlePath } from '../../../shared/assistant-bundle-path'
import type { AssetCard } from '../../types'
import type { StudioState } from '../../store/types'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import { loadPerformerImportContext, normalizeImportedPerformerAsset } from '../../lib/performer-import'
import {
    collectVisibleCanvasNodeRects,
    resolveActCreationClusterLayout,
} from '../../lib/canvas-node-layout'
import { buildDraftDeleteCascade } from '../../store/cascade-cleanup'
import { removeMarkdownEditorsByDraftIds } from '../../store/workspace-helpers'

// ── Ref state ────────────────────────────────────────────────────────────────

type DraftRef = { kind: 'tal' | 'dance'; id: string }

type AssistantRefState = {
    performers: Map<string, string>
    acts: Map<string, string>
    drafts: Map<string, DraftRef>
    createdPerformers: Set<string>
}

function makeRefs(): AssistantRefState {
    return {
        performers: new Map(),
        acts: new Map(),
        drafts: new Map(),
        createdPerformers: new Set(),
    }
}

// ── Store access ─────────────────────────────────────────────────────────────

function store(): StudioState {
    return useStudioStore.getState()
}

async function findInstalledAssetByUrnOrName(
    kind: 'performer' | 'act',
    options: { urn?: string; name?: string },
): Promise<AssetCard | null> {
    const assets = await api.assets.list(kind) as AssetCard[]
    if (options.urn) {
        return assets.find((asset) => asset.urn === options.urn) || null
    }
    const target = normalizeName(options.name)
    return assets.find((asset) => normalizeName(asset.name) === target) || null
}

// ── Entity resolution helpers ─────────────────────────────────────────────────

function normalizeName(value: string | null | undefined) {
    return value?.trim().toLowerCase() || null
}

function resolvePerformerId(
    refs: AssistantRefState,
    options: { performerId?: string; performerRef?: string; performerName?: string },
): string | null {
    const s = store()
    if (options.performerId && s.performers.some((p) => p.id === options.performerId)) {
        return options.performerId
    }
    if (options.performerRef) {
        return refs.performers.get(options.performerRef) || null
    }
    if (options.performerName) {
        const target = normalizeName(options.performerName)
        return s.performers.find((p) => normalizeName(p.name) === target)?.id || null
    }
    return null
}

function resolveActId(
    refs: AssistantRefState,
    options: { actId?: string; actRef?: string; actName?: string },
): string | null {
    const s = store()
    if (options.actId && s.acts.some((a) => a.id === options.actId)) {
        return options.actId
    }
    if (options.actRef) {
        return refs.acts.get(options.actRef) || null
    }
    if (options.actName) {
        const target = normalizeName(options.actName)
        return s.acts.find((a) => normalizeName(a.name) === target)?.id || null
    }
    return null
}

function resolveDraftId(
    refs: AssistantRefState,
    kind: 'tal' | 'dance',
    options: { draftId?: string; draftRef?: string; draftName?: string },
    flags?: { savedOnly?: boolean },
): string | null {
    const requireSaved = flags?.savedOnly === true
    const stateDrafts = store().drafts
    const isAllowed = (draftId: string | undefined | null) => {
        if (!draftId) return false
        const draft = stateDrafts[draftId]
        if (!draft || draft.kind !== kind) return false
        if (requireSaved && draft.saveState !== 'saved') return false
        return true
    }

    if (options.draftId) {
        return isAllowed(options.draftId) ? options.draftId : null
    }
    if (options.draftRef) {
        const resolved = refs.drafts.get(options.draftRef)
        return (resolved?.kind === kind && isAllowed(resolved.id) ? resolved.id : null) || null
    }
    if (options.draftName) {
        const s = store()
        const target = normalizeName(options.draftName)
        const found = Object.values(s.drafts).find(
            (d) => d.kind === kind && (!requireSaved || d.saveState === 'saved') && normalizeName(d.name) === target,
        )
        return found?.id || null
    }
    return null
}

function resolveSavedDraftId(
    refs: AssistantRefState,
    kind: 'tal' | 'dance',
    options: { draftId?: string; draftRef?: string; draftName?: string },
) {
    return resolveDraftId(refs, kind, options, { savedOnly: true })
}

function resolveAnyDraftId(
    refs: AssistantRefState,
    options: { draftId?: string; draftRef?: string; draftName?: string; kind?: 'tal' | 'dance' },
): string | null {
    if (options.kind) {
        return resolveDraftId(refs, options.kind, options)
    }

    const stateDrafts = store().drafts
    if (options.draftId) {
        const draft = stateDrafts[options.draftId]
        return draft?.kind === 'tal' || draft?.kind === 'dance' ? options.draftId : null
    }
    if (options.draftRef) {
        const resolved = refs.drafts.get(options.draftRef)
        return resolved?.id || null
    }
    if (options.draftName) {
        const target = normalizeName(options.draftName)
        const found = Object.values(stateDrafts).find(
            (draft) => (draft.kind === 'tal' || draft.kind === 'dance') && normalizeName(draft.name) === target,
        )
        return found?.id || null
    }

    return null
}

function resolveStudioNodeId(
    refs: AssistantRefState,
    nodeType: AssistantStudioNodeType,
    options: {
        performerId?: string
        performerRef?: string
        performerName?: string
        actId?: string
        actRef?: string
        actName?: string
    },
) {
    return nodeType === 'performer'
        ? resolvePerformerId(refs, options)
        : resolveActId(refs, options)
}

function resolveParticipantKey(
    refs: AssistantRefState,
    actId: string,
    options: {
        participantKey?: string
        performerId?: string
        performerRef?: string
        performerName?: string
    },
    attachIfMissing = true,
): string | null {
    const s = store()
    const act = s.acts.find((a) => a.id === actId)
    if (!act) return null
    const existing = resolveBoundParticipantKey(refs, actId, options)
    if (existing) return existing
    if (!attachIfMissing) return null
    const performerId = resolvePerformerId(refs, options)
    if (!performerId) return null
    return s.attachPerformerToAct(actId, performerId)
}

function getActById(actId: string) {
    return store().acts.find((act) => act.id === actId) || null
}

function hasRelation(actId: string, relationId: string) {
    return !!getActById(actId)?.relations.some((relation) => relation.id === relationId)
}

function bindingMatchesPerformer(performerId: string, binding: StudioState['acts'][number]['participants'][string]) {
    const performer = store().performers.find((entry) => entry.id === performerId)
    if (!performer) return false

    return (
        (binding.performerRef.kind === 'draft' && (
            performer.meta?.derivedFrom === binding.performerRef.draftId
            || performerId === binding.performerRef.draftId
        ))
        || (binding.performerRef.kind === 'registry' && performer.meta?.derivedFrom === binding.performerRef.urn)
    )
}

function resolveBoundParticipantKey(
    refs: AssistantRefState,
    actId: string,
    options: {
        participantKey?: string
        performerId?: string
        performerRef?: string
        performerName?: string
    },
): string | null {
    const act = getActById(actId)
    if (!act) return null
    if (options.participantKey && act.participants[options.participantKey]) {
        return options.participantKey
    }

    const performerId = resolvePerformerId(refs, options)
    if (!performerId) return null

    const matchedKey = Object.keys(act.participants).find((key) =>
        bindingMatchesPerformer(performerId, act.participants[key]),
    )
    if (matchedKey) {
        return matchedKey
    }

    const performerName = store().performers.find((performer) => performer.id === performerId)?.name
    if (performerName && act.participants[performerName]) {
        return performerName
    }

    return null
}

function resolveSubscriptionMessagesFrom(
    refs: AssistantRefState,
    actId: string,
    subscriptions: AssistantParticipantSubscriptionsInput,
): string[] | null {
    const resolved = new Set<string>()
    const directKeys = subscriptions.messagesFromParticipantKeys || []
    const act = getActById(actId)
    if (!act) return null

    for (const key of directKeys) {
        if (!act.participants[key]) {
            return null
        }
        resolved.add(key)
    }

    for (const performerId of subscriptions.messagesFromPerformerIds || []) {
        const key = resolveBoundParticipantKey(refs, actId, { performerId })
        if (!key) return null
        resolved.add(key)
    }

    for (const performerRef of subscriptions.messagesFromPerformerRefs || []) {
        const key = resolveBoundParticipantKey(refs, actId, { performerRef })
        if (!key) return null
        resolved.add(key)
    }

    for (const performerName of subscriptions.messagesFromPerformerNames || []) {
        const key = resolveBoundParticipantKey(refs, actId, { performerName })
        if (!key) return null
        resolved.add(key)
    }

    return Array.from(resolved)
}

function resolveActParticipantPerformerIds(
    refs: AssistantRefState,
    action: Extract<AssistantAction, { type: 'createAct' }>,
) {
    const performerIds: string[] = []
    for (const performerId of action.participantPerformerIds || []) {
        if (store().performers.some((performer) => performer.id === performerId)) {
            performerIds.push(performerId)
        }
    }
    for (const performerRef of action.participantPerformerRefs || []) {
        const performerId = refs.performers.get(performerRef)
        if (performerId) {
            performerIds.push(performerId)
        }
    }
    for (const performerName of action.participantPerformerNames || []) {
        const performerId = resolvePerformerId(refs, { performerName })
        if (performerId) {
            performerIds.push(performerId)
        }
    }

    return Array.from(new Set(performerIds))
}

function autoLayoutAssistantActCluster(
    refs: AssistantRefState,
    actId: string,
    participantPerformerIds: string[],
) {
    if (participantPerformerIds.length === 0) return
    if (!participantPerformerIds.every((performerId) => refs.createdPerformers.has(performerId))) return

    const current = store()
    const occupiedRects = collectVisibleCanvasNodeRects(
        current.performers.filter((performer) => !participantPerformerIds.includes(performer.id)),
        current.acts.filter((act) => act.id !== actId),
    )
    const layout = resolveActCreationClusterLayout({
        canvasCenter: current.canvasCenter,
        occupiedRects,
        performerIds: participantPerformerIds,
    })

    useStudioStore.setState((state) => ({
        performers: state.performers.map((performer) => {
            const nextPosition = layout.performerPositions.get(performer.id)
            return nextPosition
                ? { ...performer, position: nextPosition }
                : performer
        }),
        acts: state.acts.map((act) => (
            act.id === actId
                ? { ...act, position: layout.actPosition }
                : act
        )),
        canvasRevealTarget: {
            id: actId,
            type: 'act',
            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
        },
        workspaceDirty: true,
    }))
}

function applyNodeReveal(nodeId: string, nodeType: AssistantStudioNodeType) {
    store().revealCanvasNode(nodeId, nodeType)
}

function applyNodeSelection(nodeId: string, nodeType: AssistantStudioNodeType) {
    if (nodeType === 'performer') {
        store().selectPerformer(nodeId)
    } else {
        store().selectAct(nodeId)
    }
}

function getNodeHidden(nodeId: string, nodeType: AssistantStudioNodeType) {
    return nodeType === 'performer'
        ? !!store().performers.find((performer) => performer.id === nodeId)?.hidden
        : !!store().acts.find((act) => act.id === nodeId)?.hidden
}

function setNodeVisibility(nodeId: string, nodeType: AssistantStudioNodeType, visible: boolean) {
    const hidden = getNodeHidden(nodeId, nodeType)
    if (hidden === visible) {
        if (nodeType === 'performer') {
            store().togglePerformerVisibility(nodeId)
        } else {
            store().toggleActVisibility(nodeId)
        }
    }
}

function setNodeFrame(
    nodeId: string,
    nodeType: AssistantStudioNodeType,
    frame: {
        position?: { x: number; y: number }
        size?: { width: number; height: number }
    },
) {
    if (nodeType === 'performer') {
        if (frame.position) store().updatePerformerPosition(nodeId, frame.position.x, frame.position.y)
        if (frame.size) store().updatePerformerSize(nodeId, frame.size.width, frame.size.height)
        return
    }

    if (frame.position) store().updateActPosition(nodeId, frame.position.x, frame.position.y)
    if (frame.size) store().updateActSize(nodeId, frame.size.width, frame.size.height)
}

// ── Draft helpers ─────────────────────────────────────────────────────────────

async function createDraft(
    kind: 'tal' | 'dance',
    blueprint: AssistantDraftBlueprint,
    refs: AssistantRefState,
): Promise<string> {
    const draft = await api.drafts.create({
        kind,
        name: blueprint.name,
        content: blueprint.content,
        ...(blueprint.slug ? { slug: blueprint.slug } : {}),
        ...(blueprint.description ? { description: blueprint.description } : {}),
        ...(blueprint.tags ? { tags: blueprint.tags } : {}),
    })
    useStudioStore.setState((state) => ({
        drafts: {
            ...state.drafts,
            [draft.id]: {
                ...draft,
                saveState: 'saved',
            },
        },
        workspaceDirty: true,
    }))
    store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
    if (blueprint.ref) {
        refs.drafts.set(blueprint.ref, { kind, id: draft.id })
    }
    if (blueprint.openEditor) {
        store().openDraftEditor(draft.id)
    }
    return draft.id
}

async function resolveDanceBundleTarget(
    refs: AssistantRefState,
    options: { draftId?: string; draftRef?: string; draftName?: string; path: string },
): Promise<{ draftId: string; path: string } | null> {
    const draftId = resolveSavedDraftId(refs, 'dance', options)
    if (!draftId) return null

    const normalizedPath = normalizeAssistantBundlePath(options.path)
    if (!normalizedPath) return null

    return { draftId, path: normalizedPath }
}

async function resolveTalRef(
    fields: AssistantPerformerFields,
    refs: AssistantRefState,
): Promise<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined> {
    // undefined = not specified (no change)
    if (fields.talUrn !== undefined) {
        return fields.talUrn ? { kind: 'registry', urn: fields.talUrn } : null
    }
    if (fields.talDraftId) {
        return { kind: 'draft', draftId: fields.talDraftId }
    }
    if (fields.talDraftRef) {
        const draftId = resolveDraftId(refs, 'tal', { draftRef: fields.talDraftRef })
        return draftId ? { kind: 'draft', draftId } : null
    }
    if (fields.talDraft) {
        const draftId = await createDraft('tal', fields.talDraft, refs)
        return { kind: 'draft', draftId }
    }
    return undefined // not specified
}

async function applyDanceAdditions(
    performerId: string,
    fields: AssistantPerformerFields,
    refs: AssistantRefState,
) {
    const s = store()
    for (const urn of fields.addDanceUrns || []) {
        s.addPerformerDanceRef(performerId, { kind: 'registry', urn })
    }
    for (const draftId of fields.addDanceDraftIds || []) {
        s.addPerformerDanceRef(performerId, { kind: 'draft', draftId })
    }
    for (const draftRef of fields.addDanceDraftRefs || []) {
        const draftId = resolveDraftId(refs, 'dance', { draftRef })
        if (draftId) s.addPerformerDanceRef(performerId, { kind: 'draft', draftId })
    }
    for (const blueprint of fields.addDanceDrafts || []) {
        const draftId = await createDraft('dance', blueprint, refs)
        store().addPerformerDanceRef(performerId, { kind: 'draft', draftId })
    }
}

function applyDanceRemovals(performerId: string, fields: AssistantPerformerFields) {
    const s = store()
    for (const urn of fields.removeDanceUrns || []) {
        s.removePerformerDance(performerId, urn)
    }
    // removeDanceDraftIds: dance refs by draftId
    for (const draftId of fields.removeDanceDraftIds || []) {
        s.removePerformerDance(performerId, draftId)
    }
}

async function applyPerformerFields(
    performerId: string,
    fields: AssistantPerformerFields,
    refs: AssistantRefState,
) {
    const s = store()
    if (fields.description !== undefined) {
        s.updatePerformerAuthoringMeta(performerId, {
            description: fields.description || '',
        })
    }
    const talRef = await resolveTalRef(fields, refs)
    if (talRef !== undefined) {
        s.setPerformerTalRef(performerId, talRef)
    }
    await applyDanceAdditions(performerId, fields, refs)
    applyDanceRemovals(performerId, fields)
    if (fields.model !== undefined) {
        s.setPerformerModel(performerId, fields.model)
    }
    if (fields.modelVariant !== undefined) {
        s.setPerformerModelVariant(performerId, fields.modelVariant || null)
    }
    for (const name of fields.addMcpServerNames || []) {
        s.addPerformerMcp(performerId, { name, status: 'connected', tools: [], resources: [] })
    }
    for (const name of fields.removeMcpServerNames || []) {
        s.removePerformerMcp(performerId, name)
    }
}

function buildParticipantSubscriptions(
    refs: AssistantRefState,
    actId: string,
    subscriptions: AssistantParticipantSubscriptionsInput,
) {
    const messagesFrom = resolveSubscriptionMessagesFrom(refs, actId, subscriptions)
    if (messagesFrom === null) {
        return null
    }

    return {
        ...(messagesFrom.length > 0 ? { messagesFrom } : {}),
        ...(subscriptions.messageTags !== undefined ? { messageTags: subscriptions.messageTags } : {}),
        ...(subscriptions.callboardKeys !== undefined ? { callboardKeys: subscriptions.callboardKeys } : {}),
        ...(subscriptions.eventTypes !== undefined ? { eventTypes: subscriptions.eventTypes } : {}),
    }
}

// ── Relation helper ───────────────────────────────────────────────────────────

async function applyRelationBlueprint(
    actId: string,
    relation: AssistantActRelationBlueprint,
    refs: AssistantRefState,
): Promise<boolean> {
    const s = store()
    if (!relation.name?.trim() || !relation.description?.trim()) return false
    const sourceOptions = {
        participantKey: relation.sourceParticipantKey,
        performerId: relation.sourcePerformerId,
        performerRef: relation.sourcePerformerRef,
        performerName: relation.sourcePerformerName,
    }
    const targetOptions = {
        participantKey: relation.targetParticipantKey,
        performerId: relation.targetPerformerId,
        performerRef: relation.targetPerformerRef,
        performerName: relation.targetPerformerName,
    }
    const sourceKey = resolveParticipantKey(refs, actId, {
        participantKey: sourceOptions.participantKey,
        performerId: sourceOptions.performerId,
        performerRef: sourceOptions.performerRef,
        performerName: sourceOptions.performerName,
    })
    const targetKey = resolveParticipantKey(refs, actId, {
        participantKey: targetOptions.participantKey,
        performerId: targetOptions.performerId,
        performerRef: targetOptions.performerRef,
        performerName: targetOptions.performerName,
    })
    if (!sourceKey || !targetKey || sourceKey === targetKey) return false

    const relationId = s.addRelation(actId, [sourceKey, targetKey], relation.direction || 'both')
    if (!relationId) return false

    const patch = {
        ...(relation.name ? { name: relation.name } : {}),
        ...(relation.description ? { description: relation.description } : {}),
    }
    if (Object.keys(patch).length > 0) {
        store().updateRelation(actId, relationId, patch)
    }
    return true
}

// ── Main action handler ───────────────────────────────────────────────────────

export async function applyAssistantAction(
    action: AssistantAction,
    refs: AssistantRefState = makeRefs(),
): Promise<{ success: boolean }> {
    try {
        switch (action.type) {
            case 'installRegistryAsset': {
                await api.dot.install(action.urn, undefined, false, action.scope || 'stage')
                return { success: true }
            }
            case 'addDanceFromGitHub': {
                await api.dot.addFromGitHub(action.source, action.scope || 'stage')
                return { success: true }
            }
            case 'importInstalledPerformer': {
                const asset = await findInstalledAssetByUrnOrName('performer', {
                    urn: action.urn,
                    name: action.performerName,
                })
                if (!asset) return { success: false }
                const context = await loadPerformerImportContext()
                store().addPerformerFromAsset(normalizeImportedPerformerAsset(asset, context))
                return { success: true }
            }
            case 'importInstalledAct': {
                const asset = await findInstalledAssetByUrnOrName('act', {
                    urn: action.urn,
                    name: action.actName,
                })
                if (!asset) return { success: false }
                await store().importActFromAsset(asset)
                return { success: true }
            }

            // ── Tal draft CRUD ────────────────────────────────────────────────
            case 'createTalDraft': {
                await createDraft('tal', action, refs)
                return { success: true }
            }
            case 'updateTalDraft': {
                const draftId = resolveSavedDraftId(refs, 'tal', action)
                if (!draftId) return { success: false }
                const draft = await api.drafts.update('tal', draftId, {
                    ...(action.name ? { name: action.name } : {}),
                    ...(action.content ? { content: action.content } : {}),
                    ...(action.description !== undefined ? { description: action.description } : {}),
                    ...(action.tags ? { tags: action.tags } : {}),
                })
                useStudioStore.setState((state) => ({
                    drafts: { ...state.drafts, [draft.id]: { ...draft, saveState: 'saved' } },
                    workspaceDirty: true,
                }))
                store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
                return { success: true }
            }
            case 'deleteTalDraft': {
                const draftId = resolveSavedDraftId(refs, 'tal', action)
                if (!draftId) return { success: false }
                await api.drafts.delete('tal', draftId)
                useStudioStore.setState((state) => {
                    const drafts = { ...state.drafts }
                    delete drafts[draftId]
                    const cascade = buildDraftDeleteCascade('tal', draftId, state.performers, state.acts)
                    return {
                        drafts,
                        markdownEditors: removeMarkdownEditorsByDraftIds(state.markdownEditors, [draftId]),
                        ...cascade,
                        workspaceDirty: true,
                    }
                })
                store().recordStudioChange({ kind: 'draft', draftIds: [draftId], workspaceWide: true })
                return { success: true }
            }

            // ── Dance draft CRUD ──────────────────────────────────────────────
            case 'createDanceDraft': {
                await createDraft('dance', action, refs)
                return { success: true }
            }
            case 'updateDanceDraft': {
                const draftId = resolveSavedDraftId(refs, 'dance', action)
                if (!draftId) return { success: false }
                const draft = await api.drafts.update('dance', draftId, {
                    ...(action.name ? { name: action.name } : {}),
                    ...(action.content ? { content: action.content } : {}),
                    ...(action.description !== undefined ? { description: action.description } : {}),
                    ...(action.tags ? { tags: action.tags } : {}),
                })
                useStudioStore.setState((state) => ({
                    drafts: { ...state.drafts, [draft.id]: { ...draft, saveState: 'saved' } },
                    workspaceDirty: true,
                }))
                store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
                return { success: true }
            }
            case 'deleteDanceDraft': {
                const draftId = resolveSavedDraftId(refs, 'dance', action)
                if (!draftId) return { success: false }
                await api.drafts.delete('dance', draftId)
                useStudioStore.setState((state) => {
                    const drafts = { ...state.drafts }
                    delete drafts[draftId]
                    const cascade = buildDraftDeleteCascade('dance', draftId, state.performers, state.acts)
                    return {
                        drafts,
                        markdownEditors: removeMarkdownEditorsByDraftIds(state.markdownEditors, [draftId]),
                        ...cascade,
                        workspaceDirty: true,
                    }
                })
                store().recordStudioChange({ kind: 'draft', draftIds: [draftId], workspaceWide: true })
                return { success: true }
            }
            case 'upsertDanceBundleFile': {
                const target = await resolveDanceBundleTarget(refs, action)
                if (!target) return { success: false }
                await api.drafts.danceBundle.writeFile(target.draftId, target.path, action.content)
                return { success: true }
            }
            case 'deleteDanceBundleEntry': {
                const target = await resolveDanceBundleTarget(refs, action)
                if (!target) return { success: false }
                await api.drafts.danceBundle.deleteFile(target.draftId, target.path)
                return { success: true }
            }

            // ── Performer CRUD ────────────────────────────────────────────────
            case 'createPerformer': {
                const performerId = store().addPerformer(action.name)
                if (action.ref) refs.performers.set(action.ref, performerId)
                refs.createdPerformers.add(performerId)
                await applyPerformerFields(performerId, action, refs)
                return { success: true }
            }
            case 'updatePerformer': {
                const performerId = resolvePerformerId(refs, action)
                if (!performerId) return { success: false }
                if (action.name) store().updatePerformerName(performerId, action.name)
                await applyPerformerFields(performerId, action, refs)
                return { success: true }
            }
            case 'deletePerformer': {
                const performerId = resolvePerformerId(refs, action)
                if (!performerId) return { success: false }
                store().removePerformer(performerId)
                return { success: true }
            }

            // ── Act CRUD ──────────────────────────────────────────────────────
            case 'createAct': {
                if ((action.relations || []).some((relation) => !relation.name?.trim() || !relation.description?.trim())) {
                    return { success: false }
                }
                const actId = store().addAct(action.name)
                if (action.ref) refs.acts.set(action.ref, actId)
                if (action.description) store().updateActDescription(actId, action.description)
                if (action.actRules !== undefined) store().updateActRules(actId, action.actRules)
                if (action.safety !== undefined) store().updateActSafety(actId, action.safety)
                const participantPerformerIds = resolveActParticipantPerformerIds(refs, action)
                for (const id of participantPerformerIds) {
                    store().attachPerformerToAct(actId, id)
                }
                for (const relation of action.relations || []) {
                    await applyRelationBlueprint(actId, relation, refs)
                }
                autoLayoutAssistantActCluster(refs, actId, participantPerformerIds)
                return { success: true }
            }
            case 'updateAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                if (action.name) store().renameAct(actId, action.name)
                if (action.description !== undefined) store().updateActDescription(actId, action.description)
                if (action.actRules !== undefined) store().updateActRules(actId, action.actRules)
                if (action.safety !== undefined) store().updateActSafety(actId, action.safety ?? undefined)
                return { success: true }
            }
            case 'deleteAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                store().removeAct(actId)
                return { success: true }
            }

            // ── Participant management ─────────────────────────────────────────
            case 'attachPerformerToAct': {
                const actId = resolveActId(refs, action)
                const performerId = resolvePerformerId(refs, action)
                if (!actId || !performerId) return { success: false }
                return { success: !!store().attachPerformerToAct(actId, performerId) }
            }
            case 'detachParticipantFromAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                const act = getActById(actId)
                if (!act) return { success: false }
                const key = resolveBoundParticipantKey(refs, actId, action)
                if (!key || !act.participants[key]) return { success: false }
                store().unbindPerformerFromAct(actId, key)
                return { success: true }
            }
            case 'updateParticipantSubscriptions': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                const participantKey = resolveBoundParticipantKey(refs, actId, action)
                if (!participantKey) return { success: false }
                if (action.subscriptions === null) {
                    store().updatePerformerBinding(actId, participantKey, { subscriptions: undefined })
                    return { success: true }
                }
                const subscriptions = buildParticipantSubscriptions(refs, actId, action.subscriptions)
                if (!subscriptions) return { success: false }
                store().updatePerformerBinding(actId, participantKey, { subscriptions })
                return { success: true }
            }

            // ── Relation management ───────────────────────────────────────────
            case 'connectPerformers': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                if (!action.name?.trim() || !action.description?.trim()) return { success: false }
                const ok = await applyRelationBlueprint(actId, action, refs)
                return { success: ok }
            }
            case 'updateRelation': {
                const actId = resolveActId(refs, action)
                if (!actId || !hasRelation(actId, action.relationId)) return { success: false }
                const patch = {
                    ...(action.name !== undefined ? { name: action.name } : {}),
                    ...(action.description !== undefined ? { description: action.description } : {}),
                    ...(action.direction !== undefined ? { direction: action.direction } : {}),
                }
                store().updateRelation(actId, action.relationId, patch)
                return { success: true }
            }
            case 'removeRelation': {
                const actId = resolveActId(refs, action)
                if (!actId || !hasRelation(actId, action.relationId)) return { success: false }
                store().removeRelation(actId, action.relationId)
                return { success: true }
            }

            // ── Studio UI and canvas operations ──────────────────────────────
            case 'showPerformer': {
                const performerId = resolvePerformerId(refs, action)
                if (!performerId) return { success: false }
                if (action.surface === 'editor') {
                    store().openPerformerEditor(performerId, action.editorFocus || null)
                } else {
                    applyNodeSelection(performerId, 'performer')
                }
                if (action.reveal !== false) {
                    applyNodeReveal(performerId, 'performer')
                }
                return { success: true }
            }
            case 'showAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                const act = getActById(actId)
                if (!act) return { success: false }

                store().closeEditor()
                applyNodeSelection(actId, 'act')
                if (action.reveal !== false) {
                    applyNodeReveal(actId, 'act')
                }
                if (action.surface === 'editor') {
                    if (action.editorMode === 'participant') {
                        if (!action.participantKey || !act.participants[action.participantKey]) return { success: false }
                        store().openActParticipantEditor(actId, action.participantKey)
                    } else if (action.editorMode === 'relation') {
                        if (!action.relationId || !hasRelation(actId, action.relationId)) return { success: false }
                        store().openActRelationEditor(actId, action.relationId)
                    } else {
                        store().openActEditor(actId, 'act')
                    }
                }
                return { success: true }
            }
            case 'showDraft': {
                const draftId = resolveAnyDraftId(refs, action)
                if (!draftId) return { success: false }
                store().closeEditor()
                return { success: store().openDraftEditor(draftId) !== null }
            }
            case 'setStudioNodeVisibility': {
                const nodeId = resolveStudioNodeId(refs, action.nodeType, action)
                if (!nodeId) return { success: false }
                setNodeVisibility(nodeId, action.nodeType, action.visible)
                if (action.visible) {
                    applyNodeReveal(nodeId, action.nodeType)
                }
                return { success: true }
            }
            case 'setStudioNodeFrame': {
                const nodeId = resolveStudioNodeId(refs, action.nodeType, action)
                if (!nodeId) return { success: false }
                if (!action.position && !action.size) return { success: false }
                setNodeFrame(nodeId, action.nodeType, {
                    ...(action.position ? { position: action.position } : {}),
                    ...(action.size ? { size: action.size } : {}),
                })
                applyNodeReveal(nodeId, action.nodeType)
                return { success: true }
            }
            case 'setStudioPanel': {
                switch (action.panel) {
                    case 'assetLibrary':
                        store().setAssetLibraryOpen(action.open)
                        break
                    case 'workspaceTracking':
                        store().setTrackingOpen(action.open)
                        break
                    case 'terminal':
                        store().setTerminalOpen(action.open)
                        break
                    default:
                        return { success: false }
                }
                return { success: true }
            }

            default:
                return { success: false }
        }
    } catch (err) {
        console.error(`[Assistant] Failed to apply ${(action as AssistantAction).type}:`, err)
        return { success: false }
    }
}

export async function applyAssistantActions(actions: AssistantAction[]) {
    const expectedWorkingDir = store().workingDir
    const refs = makeRefs()
    let applied = 0
    let failed = 0
    for (const action of actions) {
        if (store().workingDir !== expectedWorkingDir) {
            break
        }
        const result = await applyAssistantAction(action, refs)
        if (result.success) applied++
        else failed++
    }
    return { applied, failed }
}
