import type {
    AssistantAction,
    AssistantActRelationBlueprint,
    AssistantDraftBlueprint,
    AssistantParticipantSubscriptionsInput,
    AssistantPerformerFields,
} from '../../../shared/assistant-actions'
import { normalizeAssistantBundlePath } from '../../../shared/assistant-bundle-path'
import type { AssetCard } from '../../types'
import type { StudioState } from '../../store/types'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import { buildDraftDeleteCascade } from '../../store/cascade-cleanup'
import { removeMarkdownEditorsByDraftIds } from '../../store/workspace-helpers'

// ── Ref state ────────────────────────────────────────────────────────────────

type DraftRef = { kind: 'tal' | 'dance'; id: string }

type AssistantRefState = {
    performers: Map<string, string>
    acts: Map<string, string>
    drafts: Map<string, DraftRef>
}

function makeRefs(): AssistantRefState {
    return {
        performers: new Map(),
        acts: new Map(),
        drafts: new Map(),
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
    const talRef = await resolveTalRef(fields, refs)
    if (talRef !== undefined) {
        s.setPerformerTalRef(performerId, talRef)
    }
    await applyDanceAdditions(performerId, fields, refs)
    applyDanceRemovals(performerId, fields)
    if (fields.model !== undefined) {
        s.setPerformerModel(performerId, fields.model)
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
        participantKey: relation.sourceParticipantKey || relation.fromParticipantKey,
        performerId: relation.sourcePerformerId || relation.fromPerformerId,
        performerRef: relation.sourcePerformerRef || relation.fromPerformerRef,
        performerName: relation.sourcePerformerName || relation.fromPerformerName,
    }
    const targetOptions = {
        participantKey: relation.targetParticipantKey || relation.toParticipantKey,
        performerId: relation.targetPerformerId || relation.toPerformerId,
        performerRef: relation.targetPerformerRef || relation.toPerformerRef,
        performerName: relation.targetPerformerName || relation.toPerformerName,
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
                store().addPerformerFromAsset(asset)
                return { success: true }
            }
            case 'importInstalledAct': {
                const asset = await findInstalledAssetByUrnOrName('act', {
                    urn: action.urn,
                    name: action.actName,
                })
                if (!asset) return { success: false }
                store().importActFromAsset(asset)
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
                for (const id of action.participantPerformerIds || []) {
                    store().attachPerformerToAct(actId, id)
                }
                for (const ref of action.participantPerformerRefs || []) {
                    const id = refs.performers.get(ref)
                    if (id) store().attachPerformerToAct(actId, id)
                }
                for (const name of action.participantPerformerNames || []) {
                    const id = resolvePerformerId(refs, { performerName: name })
                    if (id) store().attachPerformerToAct(actId, id)
                }
                for (const relation of action.relations || []) {
                    await applyRelationBlueprint(actId, relation, refs)
                }
                return { success: true }
            }
            case 'updateAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                if (action.name) store().renameAct(actId, action.name)
                if (action.description !== undefined) store().updateActDescription(actId, action.description)
                if (action.actRules !== undefined) store().updateActRules(actId, action.actRules)
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
