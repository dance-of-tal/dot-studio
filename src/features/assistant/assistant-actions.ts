import type {
    AssistantAction,
    AssistantActRelationBlueprint,
    AssistantDraftBlueprint,
    AssistantPerformerFields,
} from '../../../shared/assistant-actions'
import type { StudioState } from '../../store/types'
import { useStudioStore } from '../../store'
import { api } from '../../api'

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
): string | null {
    if (options.draftId) return options.draftId
    if (options.draftRef) {
        const resolved = refs.drafts.get(options.draftRef)
        return (resolved?.kind === kind ? resolved.id : null) || null
    }
    if (options.draftName) {
        const s = store()
        const target = normalizeName(options.draftName)
        const found = Object.values(s.drafts).find(
            (d) => d.kind === kind && normalizeName(d.name) === target,
        )
        return found?.id || null
    }
    return null
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
): string | null {
    const s = store()
    const act = s.acts.find((a) => a.id === actId)
    if (!act) return null
    if (options.participantKey && act.participants[options.participantKey]) {
        return options.participantKey
    }
    // Resolve performer → auto-attach if needed
    const performerId = resolvePerformerId(refs, options)
    if (!performerId) return null
    return s.attachPerformerToAct(actId, performerId)
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
        drafts: { ...state.drafts, [draft.id]: draft },
        workspaceDirty: true,
    }))
    if (blueprint.ref) {
        refs.drafts.set(blueprint.ref, { kind, id: draft.id })
    }
    if (blueprint.openEditor) {
        store().openDraftEditor(draft.id)
    }
    return draft.id
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

// ── Relation helper ───────────────────────────────────────────────────────────

async function applyRelationBlueprint(
    actId: string,
    relation: AssistantActRelationBlueprint,
    refs: AssistantRefState,
): Promise<boolean> {
    const s = store()
    const sourceKey = resolveParticipantKey(refs, actId, {
        participantKey: relation.sourceParticipantKey,
        performerId: relation.sourcePerformerId,
        performerRef: relation.sourcePerformerRef,
        performerName: relation.sourcePerformerName,
    })
    const targetKey = resolveParticipantKey(refs, actId, {
        participantKey: relation.targetParticipantKey,
        performerId: relation.targetPerformerId,
        performerRef: relation.targetPerformerRef,
        performerName: relation.targetPerformerName,
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

            // ── Tal draft CRUD ────────────────────────────────────────────────
            case 'createTalDraft': {
                await createDraft('tal', action, refs)
                return { success: true }
            }
            case 'updateTalDraft': {
                const draftId = resolveDraftId(refs, 'tal', action)
                if (!draftId) return { success: false }
                const draft = await api.drafts.update('tal', draftId, {
                    ...(action.name ? { name: action.name } : {}),
                    ...(action.content ? { content: action.content } : {}),
                    ...(action.description !== undefined ? { description: action.description } : {}),
                    ...(action.tags ? { tags: action.tags } : {}),
                })
                useStudioStore.setState((state) => ({
                    drafts: { ...state.drafts, [draft.id]: draft },
                    workspaceDirty: true,
                }))
                return { success: true }
            }
            case 'deleteTalDraft': {
                const draftId = resolveDraftId(refs, 'tal', action)
                if (!draftId) return { success: false }
                await api.drafts.delete('tal', draftId)
                useStudioStore.setState((state) => {
                    const drafts = { ...state.drafts }
                    delete drafts[draftId]
                    return { drafts, workspaceDirty: true }
                })
                return { success: true }
            }

            // ── Dance draft CRUD ──────────────────────────────────────────────
            case 'createDanceDraft': {
                await createDraft('dance', action, refs)
                return { success: true }
            }
            case 'updateDanceDraft': {
                const draftId = resolveDraftId(refs, 'dance', action)
                if (!draftId) return { success: false }
                const draft = await api.drafts.update('dance', draftId, {
                    ...(action.name ? { name: action.name } : {}),
                    ...(action.content ? { content: action.content } : {}),
                    ...(action.description !== undefined ? { description: action.description } : {}),
                    ...(action.tags ? { tags: action.tags } : {}),
                })
                useStudioStore.setState((state) => ({
                    drafts: { ...state.drafts, [draft.id]: draft },
                    workspaceDirty: true,
                }))
                return { success: true }
            }
            case 'deleteDanceDraft': {
                const draftId = resolveDraftId(refs, 'dance', action)
                if (!draftId) return { success: false }
                await api.drafts.delete('dance', draftId)
                useStudioStore.setState((state) => {
                    const drafts = { ...state.drafts }
                    delete drafts[draftId]
                    return { drafts, workspaceDirty: true }
                })
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
                const actId = store().addAct(action.name)
                if (action.ref) refs.acts.set(action.ref, actId)
                if (action.description) store().updateActDescription(actId, action.description)
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
                store().attachPerformerToAct(actId, performerId)
                return { success: true }
            }
            case 'detachParticipantFromAct': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                let key = action.participantKey
                if (!key) {
                    const s = store()
                    const act = s.acts.find((a) => a.id === actId)
                    if (!act) return { success: false }
                    // Resolve by performer identity
                    const performerId = resolvePerformerId(refs, action)
                    if (performerId) {
                        key = Object.keys(act.participants).find((k) => {
                            const binding = act.participants[k]
                            return (
                                (binding.performerRef.kind === 'draft' && (
                                    s.performers.find((p) => p.id === performerId)?.meta?.derivedFrom === binding.performerRef.draftId
                                    || performerId === binding.performerRef.draftId
                                ))
                                || (binding.performerRef.kind === 'registry' && (
                                    s.performers.find((p) => p.id === performerId)?.meta?.derivedFrom === binding.performerRef.urn
                                ))
                            )
                        }) || undefined
                        // fallback: match by performer name as key
                        if (!key) {
                            const performerName = s.performers.find((p) => p.id === performerId)?.name
                            if (performerName && act.participants[performerName]) key = performerName
                        }
                    }
                }
                if (!key) return { success: false }
                store().unbindPerformerFromAct(actId, key)
                return { success: true }
            }

            // ── Relation management ───────────────────────────────────────────
            case 'connectPerformers': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
                const ok = await applyRelationBlueprint(actId, action, refs)
                return { success: ok }
            }
            case 'updateRelation': {
                const actId = resolveActId(refs, action)
                if (!actId) return { success: false }
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
                if (!actId) return { success: false }
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
    const refs = makeRefs()
    let applied = 0
    let failed = 0
    for (const action of actions) {
        const result = await applyAssistantAction(action, refs)
        if (result.success) applied++
        else failed++
    }
    return { applied, failed }
}
