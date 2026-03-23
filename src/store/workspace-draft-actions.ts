import { api } from '../api'
import type { AssetRef, DanceDeliveryMode, DraftAsset, MarkdownEditorNode, WorkspaceActParticipantBinding, ActRelation } from '../types'
import { ACT_DEFAULT_EXPANDED_HEIGHT, ACT_DEFAULT_WIDTH } from '../lib/act-layout'
import { createPerformerNode } from '../lib/performers'
import { defaultMarkdownContent } from './workspace-helpers'
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
    subscriptions?: WorkspaceActParticipantBinding['subscriptions']
    position?: { x: number; y: number }
}

type ActDraftContent = {
    description?: string
    actRules?: string[]
    participants?: Record<string, ActDraftParticipant>
    relations?: ActRelation[]
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
            api.drafts.create({
                kind,
                name: current.name,
                content: current.content,
                slug: current.slug,
                description: current.description,
                tags: current.tags,
                derivedFrom: current.derivedFrom,
            }).catch(() => {
                console.warn('Failed to persist draft to disk', error)
            })
        })
    })
}

export async function savePerformerAsDraftImpl(get: GetState, set: SetState, performerId: string) {
    const performer = get().performers.find((item) => item.id === performerId)
    if (!performer) return

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
            description: performer.name,
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
                subscriptions: participant.subscriptions,
            }]),
        ),
        relations: act.relations.map((relation) => ({
            id: relation.id,
            between: relation.between,
            direction: relation.direction,
            name: relation.name,
            description: relation.description,
        })),
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
) {
    performerIdCounter.value++
    const id = `performer-${performerIdCounter.value}`
    const finalX = get().canvasCenter?.x ?? (60 + (get().performers.length * 28))
    const finalY = get().canvasCenter?.y ?? (60 + (get().performers.length * 20))

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
    if (draftContent.participants && typeof draftContent.participants === 'object') {
        let index = 0
        for (const [key, participant] of Object.entries(draftContent.participants)) {
            participants[key] = {
                performerRef: participant.performerRef || { kind: 'draft', draftId: '' },
                subscriptions: participant.subscriptions,
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
        position: { x: centerX, y: centerY },
        width: ACT_DEFAULT_WIDTH,
        height: ACT_DEFAULT_EXPANDED_HEIGHT,
        participants,
        relations: Array.isArray(draftContent.relations) ? draftContent.relations : [],
        createdAt: Date.now(),
    }

    set((state: StudioState) => ({
        acts: [...state.acts, nextAct],
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

    set((state: StudioState) => ({
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
            },
        },
        markdownEditors: [
            ...state.markdownEditors,
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
        inspectorFocus: null,
        workspaceDirty: true,
    }))

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
        set({
            selectedMarkdownEditorId: existing.id,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
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

    set((state: StudioState) => ({
        markdownEditors: [
            ...state.markdownEditors,
            {
                id: editorId,
                kind,
                position: {
                    x: 160 + (state.markdownEditors.length * 28),
                    y: 140 + (state.markdownEditors.length * 24),
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
        inspectorFocus: null,
        workspaceDirty: true,
    }))

    return editorId
}
