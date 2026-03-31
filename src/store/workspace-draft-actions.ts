import { api } from '../api'
import type { AssetRef, DanceDeliveryMode, DraftAsset, MarkdownEditorNode, WorkspaceActParticipantBinding, ActRelation } from '../types'
import { ACT_DEFAULT_EXPANDED_HEIGHT, ACT_DEFAULT_WIDTH } from '../lib/act-layout'
import { createPerformerNode } from '../lib/performers'
import { createActParticipantKey } from './act-slice-helpers'
import { defaultMarkdownContent } from './workspace-helpers'
import { buildExitFocusModeState } from './workspace-focus-actions'
import type { StudioState } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

type PerformerDraftContent = {
    talRef?: AssetRef | null
    danceRefs?: AssetRef[]
    model?: StudioState['performers'][number]['model']
    modelVariant?: string | null
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    danceDeliveryMode?: DanceDeliveryMode
    planMode?: boolean
}

type ActDraftParticipant = {
    performerRef?: AssetRef
    displayName?: string
    subscriptions?: WorkspaceActParticipantBinding['subscriptions']
    position?: { x: number; y: number }
}

type ActDraftContent = {
    description?: string
    actRules?: string[]
    participants?: Record<string, ActDraftParticipant>
    relations?: ActRelation[]
    /** Authoring state — preserved across draft round-trip */
    position?: { x: number; y: number }
    width?: number
    height?: number
    hidden?: boolean
    safety?: {
        confirmModeEnabled?: boolean
        cooldownMs?: number
    }
    meta?: Record<string, unknown>
}

export function upsertDraftImpl(
    get: GetState,
    set: SetState,
    scheduleDraftPersist: (draftId: string, fn: () => void, delay?: number) => void,
    draft: DraftAsset,
) {
    set((state: StudioState) => ({
        drafts: {
            ...state.drafts,
            [draft.id]: draft,
        },
        workspaceDirty: true,
    }))

    if (draft.saveState === 'unsaved') {
        return
    }

    scheduleDraftPersist(draft.id, () => {
        const current = get().drafts[draft.id]
        if (!current) return
        const kind = current.kind as 'tal' | 'dance' | 'performer' | 'act'
        api.drafts.update(kind, draft.id, {
            name: current.name,
            content: current.content,
            slug: current.slug,
            description: current.description,
            tags: current.tags,
            derivedFrom: current.derivedFrom,
        }).catch((error) => {
            console.warn('Failed to persist draft to disk', error)
        })
    })
}

export async function saveMarkdownDraftImpl(
    get: GetState,
    set: SetState,
    editorId: string,
): Promise<DraftAsset> {
    const editor = get().markdownEditors.find((entry) => entry.id === editorId)
    if (!editor) {
        throw new Error('Markdown editor not found.')
    }

    const draft = get().drafts[editor.draftId]
    if (!draft) {
        throw new Error('Draft not found.')
    }
    if ((editor.kind !== 'tal' && editor.kind !== 'dance') || (draft.kind !== 'tal' && draft.kind !== 'dance')) {
        throw new Error('Markdown draft kind mismatch.')
    }
    if (!draft.name.trim()) {
        throw new Error('Draft name is required.')
    }

    const payload = {
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        content: draft.content,
        slug: draft.slug,
        description: draft.description,
        tags: draft.tags,
        derivedFrom: draft.derivedFrom,
    }

    const saved = draft.saveState === 'saved'
        ? await api.drafts.update(draft.kind, draft.id, payload)
        : await api.drafts.create(payload)

    const nextDraft: DraftAsset = {
        id: saved.id,
        kind: saved.kind,
        name: saved.name,
        content: saved.content,
        slug: saved.slug,
        description: saved.description,
        tags: saved.tags,
        derivedFrom: saved.derivedFrom,
        updatedAt: saved.updatedAt || Date.now(),
        saveState: 'saved',
    }

    set((state: StudioState) => ({
        drafts: {
            ...state.drafts,
            [saved.id]: nextDraft,
        },
        markdownEditors: state.markdownEditors.map((entry) => (
            entry.id !== editorId
                ? entry
                : {
                    ...entry,
                    draftId: saved.id,
                    baseline: {
                        name: nextDraft.name,
                        slug: nextDraft.slug || '',
                        description: nextDraft.description || '',
                        tags: nextDraft.tags || [],
                        content: typeof nextDraft.content === 'string' ? nextDraft.content : '',
                    },
                }
        )),
        workspaceDirty: true,
    }))

    return nextDraft
}

export async function savePerformerAsDraftImpl(get: GetState, set: SetState, performerId: string) {
    const performer = get().performers.find((item) => item.id === performerId)
    if (!performer) return
    const description = performer.meta?.authoring?.description || performer.name

    const draftContent = {
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        mcpBindingMap: performer.mcpBindingMap || {},
        danceDeliveryMode: performer.danceDeliveryMode || 'auto',
        planMode: performer.planMode || false,
        agentId: performer.agentId || null,
    }

    try {
        const draft = await api.drafts.create({
            kind: 'performer',
            name: performer.name,
            content: draftContent,
            description,
        })

        set((state: StudioState) => ({
            drafts: {
                ...state.drafts,
                [draft.id]: {
                    id: draft.id,
                    kind: 'performer' as const,
                    name: draft.name,
                    content: draft.content,
                    description: draft.description,
                    updatedAt: draft.updatedAt,
                    saveState: 'saved',
                },
            },
            workspaceDirty: true,
        }))
    } catch (error) {
        console.error('Failed to save performer as draft', error)
    }
}

export async function loadDraftsFromDiskImpl(set: SetState) {
    try {
        const drafts = await api.drafts.list()
        const draftsMap: Record<string, DraftAsset> = {}
        for (const draft of drafts) {
            draftsMap[draft.id] = {
                id: draft.id,
                kind: draft.kind,
                name: draft.name,
                content: draft.content,
                slug: draft.slug,
                description: draft.description,
                tags: draft.tags,
                derivedFrom: draft.derivedFrom,
                updatedAt: draft.updatedAt || Date.now(),
                saveState: 'saved',
            }
        }
        set({ drafts: draftsMap })
    } catch (error) {
        console.warn('Failed to load drafts from disk', error)
    }
}

export async function saveActAsDraftImpl(get: GetState, set: SetState, actId: string) {
    const act = get().acts.find((entry) => entry.id === actId)
    if (!act) return

    const draftContent = {
        description: act.description,
        actRules: act.actRules,
        participants: Object.fromEntries(
            Object.entries(act.participants).map(([key, participant]) => [key, {
                performerRef: participant.performerRef,
                displayName: participant.displayName,
                subscriptions: participant.subscriptions,
                position: participant.position,
            }]),
        ),
        relations: act.relations.map((relation) => ({
            id: relation.id,
            between: relation.between,
            direction: relation.direction,
            name: relation.name,
            description: relation.description,
        })),
        safety: act.safety,
        // Authoring state for round-trip
        position: act.position,
        width: act.width,
        height: act.height,
        hidden: act.hidden,
        meta: act.meta,
    }

    try {
        const draft = await api.drafts.create({
            kind: 'act',
            name: act.name,
            content: draftContent,
            description: act.meta?.authoring?.description || act.name,
        })

        set((state: StudioState) => ({
            drafts: {
                ...state.drafts,
                [draft.id]: {
                    id: draft.id,
                    kind: 'act' as const,
                    name: draft.name,
                    content: draft.content,
                    description: draft.description,
                    updatedAt: draft.updatedAt,
                    saveState: 'saved',
                },
            },
            workspaceDirty: true,
        }))
    } catch (error) {
        console.error('Failed to save act as draft', error)
    }
}

export function addPerformerFromDraftImpl(
    get: GetState,
    set: SetState,
    performerIdCounter: { value: number },
    name: string,
    draftContent: PerformerDraftContent,
    description?: string,
) {
    performerIdCounter.value++
    const id = `performer-${performerIdCounter.value}`
    const finalX = get().canvasCenter?.x ?? (60 + (get().performers.length * 28))
    const finalY = get().canvasCenter?.y ?? (60 + (get().performers.length * 20))
    const authoringDescription = description?.trim()

    const node = createPerformerNode({
        id,
        name,
        x: finalX,
        y: finalY,
        talRef: draftContent.talRef || null,
        danceRefs: draftContent.danceRefs || [],
        model: draftContent.model || null,
        modelVariant: draftContent.modelVariant || null,
        mcpServerNames: draftContent.mcpServerNames || [],
        mcpBindingMap: draftContent.mcpBindingMap || {},
        danceDeliveryMode: draftContent.danceDeliveryMode || 'auto',
        planMode: draftContent.planMode || false,
        ...(authoringDescription
            ? {
                meta: {
                    authoring: {
                        description: authoringDescription,
                    },
                },
            }
            : {}),
    })

    set((state: StudioState) => ({
        performers: [...state.performers, node],
        editingTarget: null,
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        activeChatPerformerId: id,
        inspectorFocus: null,
        workspaceDirty: true,
    }))
}

export function importActFromDraftImpl(
    get: GetState,
    set: SetState,
    makeId: (prefix: string) => string,
    name: string,
    draftContent: ActDraftContent,
) {
    const actId = makeId('act')
    const centerX = get().canvasCenter?.x ?? 200
    const centerY = get().canvasCenter?.y ?? 200

    const participants: Record<string, WorkspaceActParticipantBinding> = {}
    const keyMapping: Record<string, string> = {}
    if (draftContent.participants && typeof draftContent.participants === 'object') {
        for (const originalKey of Object.keys(draftContent.participants)) {
            keyMapping[originalKey] = originalKey.startsWith('participant-')
                ? originalKey
                : createActParticipantKey()
        }
        let index = 0
        for (const [key, participant] of Object.entries(draftContent.participants)) {
            const internalKey = keyMapping[key]
            participants[internalKey] = {
                performerRef: participant.performerRef || { kind: 'draft', draftId: '' },
                displayName: participant.displayName || key,
                subscriptions: participant.subscriptions
                    ? {
                        ...participant.subscriptions,
                        ...(participant.subscriptions.messagesFrom
                            ? {
                                messagesFrom: participant.subscriptions.messagesFrom.map((entry) => keyMapping[entry] || entry),
                            }
                            : {}),
                    }
                    : undefined,
                position: participant.position || { x: centerX + index * 300, y: centerY },
            }
            index++
        }
    }

    const nextAct = {
        id: actId,
        name,
        description: draftContent.description,
        actRules: draftContent.actRules,
        position: (draftContent as Record<string, unknown>).position as { x: number; y: number } || { x: centerX, y: centerY },
        width: (draftContent as Record<string, unknown>).width as number || ACT_DEFAULT_WIDTH,
        height: (draftContent as Record<string, unknown>).height as number || ACT_DEFAULT_EXPANDED_HEIGHT,
        participants,
        relations: Array.isArray(draftContent.relations)
            ? draftContent.relations.map((relation) => ({
                ...relation,
                between: relation.between.map((entry) => keyMapping[entry] || entry) as [string, string],
            }))
            : [],
        createdAt: Date.now(),
        safety: (draftContent as Record<string, unknown>).safety as import('../types').WorkspaceAct['safety'],
        hidden: (draftContent as Record<string, unknown>).hidden as boolean || undefined,
        meta: (draftContent as Record<string, unknown>).meta as import('../types').WorkspaceAct['meta'],
    }

    // ── Auto-materialize performer nodes for draft-bound participants ──
    // When an Act draft references performer drafts, create visible performer
    // nodes on canvas so participants are immediately runnable.
    const existingPerformers = get().performers
    const loadedDrafts = get().drafts
    const materializedPerformers: import('../types').PerformerNode[] = []
    const materializedDraftIds = new Set<string>()

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.performerRef.kind !== 'draft' || !binding.performerRef.draftId) continue

        const draftId = binding.performerRef.draftId
        const derivedTag = `draft:${draftId}`

        // Skip if performer already on canvas for this draft
        const alreadyOnCanvas = existingPerformers.some(
            (p) => p.meta?.derivedFrom === derivedTag,
        )
        if (alreadyOnCanvas) continue

        // Skip if we already materialized one for this same draftId in this import
        if (materializedDraftIds.has(draftId)) continue

        const perfDraft = loadedDrafts[draftId]
        const perfContent = (perfDraft?.content && typeof perfDraft.content === 'object')
            ? perfDraft.content as PerformerDraftContent
            : null

        const node = createPerformerNode({
            id: makeId('performer'),
            name: perfDraft?.name || key,
            x: centerX + materializedPerformers.length * 340,
            y: centerY + 400,
            talRef: perfContent?.talRef || null,
            danceRefs: perfContent?.danceRefs || [],
            model: perfContent?.model || null,
            modelVariant: perfContent?.modelVariant || null,
            mcpServerNames: perfContent?.mcpServerNames || [],
            mcpBindingMap: perfContent?.mcpBindingMap || {},
            danceDeliveryMode: perfContent?.danceDeliveryMode || 'auto',
            planMode: perfContent?.planMode || false,
            meta: { derivedFrom: derivedTag },
        })

        materializedPerformers.push(node)
        materializedDraftIds.add(draftId)
    }

    set((state: StudioState) => ({
        acts: [...state.acts, nextAct],
        performers: [...state.performers, ...materializedPerformers],
        selectedActId: actId,
        workspaceDirty: true,
    }))
}

export function createMarkdownEditorImpl(
    get: GetState,
    set: SetState,
    markdownEditorIdCounter: { value: number },
    makeId: (prefix: string) => string,
    kind: 'tal' | 'dance',
    options?: {
        source?: {
            name?: string
            slug?: string
            description?: string
            tags?: string[]
            content?: string
            derivedFrom?: string | null | undefined
        }
        position?: { x: number; y: number }
        attachTarget?: MarkdownEditorNode['attachTarget']
    },
) {
    markdownEditorIdCounter.value++
    const editorId = `markdown-editor-${markdownEditorIdCounter.value}`
    const draftId = makeId(`${kind}-draft`)
    const source = options?.source
    const name = source?.name || (kind === 'tal' ? 'New Tal' : 'New Dance')
    const slug = source?.slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const description = source?.description || name
    const tags = source?.tags || []
    const content = source?.content || defaultMarkdownContent(kind)
    const position = options?.position || {
        x: 160 + (get().markdownEditors.length * 28),
        y: 140 + (get().markdownEditors.length * 24),
    }

    set((state: StudioState) => {
        const focusExit = buildExitFocusModeState(state)
        const markdownEditors = (focusExit?.markdownEditors as StudioState['markdownEditors'] | undefined) || state.markdownEditors

        return {
            ...focusExit,
            drafts: {
                ...state.drafts,
                [draftId]: {
                    id: draftId,
                    kind,
                    name,
                    slug,
                    description,
                    tags,
                    content,
                    derivedFrom: source?.derivedFrom || undefined,
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
            },
            markdownEditors: [
                ...markdownEditors,
                {
                    id: editorId,
                    kind,
                    position,
                    width: 560,
                    height: 380,
                    draftId,
                    baseline: source ? {
                        name,
                        slug,
                        description,
                        tags,
                        content,
                    } : null,
                    attachTarget: options?.attachTarget || null,
                    hidden: false,
                },
            ],
            selectedMarkdownEditorId: editorId,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            inspectorFocus: null,
            workspaceDirty: true,
        }
    })

    return editorId
}

export function openDraftEditorImpl(
    get: GetState,
    set: SetState,
    markdownEditorIdCounter: { value: number },
    draftId: string,
) {
    // If an editor for this draft already exists, just select it
    const existing = get().markdownEditors.find((e) => e.draftId === draftId)
    if (existing) {
        const focusExit = buildExitFocusModeState(get())
        set({
            ...(focusExit || {}),
            selectedMarkdownEditorId: existing.id,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            inspectorFocus: null,
        })
        return existing.id
    }

    const draft = get().drafts[draftId]
    if (!draft) return null

    const kind = draft.kind as 'tal' | 'dance'
    if (kind !== 'tal' && kind !== 'dance') return null

    markdownEditorIdCounter.value++
    const editorId = `markdown-editor-${markdownEditorIdCounter.value}`
    const content = typeof draft.content === 'string' ? draft.content : ''

    set((state: StudioState) => {
        const focusExit = buildExitFocusModeState(state)
        const markdownEditors = (focusExit?.markdownEditors as StudioState['markdownEditors'] | undefined) || state.markdownEditors

        return {
            ...focusExit,
            markdownEditors: [
                ...markdownEditors,
                {
                    id: editorId,
                    kind,
                    position: {
                        x: 160 + (markdownEditors.length * 28),
                        y: 140 + (markdownEditors.length * 24),
                    },
                    width: 560,
                    height: 380,
                    draftId,
                    baseline: {
                        name: draft.name,
                        slug: draft.slug || '',
                        description: draft.description || '',
                        tags: draft.tags || [],
                        content,
                    },
                    attachTarget: null,
                    hidden: false,
                },
            ],
            selectedMarkdownEditorId: editorId,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            inspectorFocus: null,
            workspaceDirty: true,
        }
    })

    return editorId
}
