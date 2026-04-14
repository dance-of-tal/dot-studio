/* eslint-disable react-refresh/only-export-components */
/**
 * publish-modal-utils.tsx – Pure helpers, types, and sub-components
 * extracted from PublishModal.tsx.
 *
 * Contains: type definitions, publishability helpers, picker-item builders,
 * preflight builders, and the PickerSection presentational component.
 */

import type { AssetCard, PerformerNode, WorkspaceAct } from '../../types'
import { useStudioStore } from '../../store'
import { registryUrnFromRef, slugifyAssetName } from '../../lib/performers'

// ── Types ───────────────────────────────────────────────

export type PickerItemLocal = { kind: 'tal'; source: 'local'; urn: string; name: string; slug: string; issue?: string }
export type PickerItemDraft = { kind: 'tal'; source: 'draft'; editorId: string; draftId: string; name: string; issue?: string }
export type PickerItemPerformer = { kind: 'performer'; source: 'canvas'; performerId: string; name: string; issue?: string }
export type PickerItemAct = { kind: 'act'; source: 'canvas'; actId: string; name: string; issue?: string }
export type PickerItem = PickerItemLocal | PickerItemDraft | PickerItemPerformer | PickerItemAct
export type PublishFormSeed = {
    slug: string
    description: string
    tagsText: string
}

export type PerformerPreflightEntry = {
    label: string
    required: boolean
    status: 'ready' | 'draft' | 'missing' | 'will_publish'
    detail: string
}

type PerformerPreflightCandidate = {
    label: string
    ref: NonNullable<PerformerNode['talRef']>
    required: boolean
}

// ── Pure helpers ────────────────────────────────────────

export function parseTags(value: string) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function isPerformerPublishable(p: PerformerNode): boolean {
    if (!p.meta?.derivedFrom) return true
    if (p.meta.authoring?.slug || p.meta.authoring?.description || (p.meta.authoring?.tags && p.meta.authoring.tags.length > 0)) return true
    return false
}

export function getPerformerIssue(p: PerformerNode): string | undefined {
    const hasTal = !!p.talRef
    const hasDance = p.danceRefs.length > 0
    if (!hasTal && !hasDance) {
        return 'Needs at least a Tal or Dance'
    }
    return undefined
}

export function getPerformerModelIssue(p: PerformerNode): string | undefined {
    if (!p.model) {
        return 'No model configured'
    }
    return undefined
}

// ── Act Validation ──────────────────────────────────────

export function getActIssue(act: WorkspaceAct): string | undefined {
    const participantIds = Object.keys(act.participants)
    if (participantIds.length === 0) return 'No participants'
    if (act.relations.length === 0) return 'No relations'

    const connectedIds = new Set<string>()
    for (const rel of act.relations) {
        connectedIds.add(rel.between[0])
        connectedIds.add(rel.between[1])
    }
    const disconnected = participantIds.filter((id) => !connectedIds.has(id))
    if (disconnected.length > 0) {
        return `Disconnected: ${disconnected.join(', ')}`
    }

    return undefined
}

export function getActPublishBlockReasons(act: WorkspaceAct): string[] {
    const reasons: string[] = []
    const participantIds = Object.keys(act.participants)

    if (participantIds.length === 0) {
        reasons.push('Act has no participants.')
    }
    if (act.relations.length === 0) {
        reasons.push('Act has no relations. Create relations between participants first.')
    }

    // Disconnected participants
    if (participantIds.length > 0 && act.relations.length > 0) {
        const connectedIds = new Set<string>()
        for (const rel of act.relations) {
            connectedIds.add(rel.between[0])
            connectedIds.add(rel.between[1])
        }
        const disconnected = participantIds.filter((id) => !connectedIds.has(id))
        if (disconnected.length > 0) {
            reasons.push(`Disconnected participant${disconnected.length > 1 ? 's' : ''}: ${disconnected.join(', ')}. All participants must be connected by relations.`)
        }

        // Dangling relations
        const dangling = act.relations.filter((r) => !act.participants[r.between[0]] || !act.participants[r.between[1]])
        if (dangling.length > 0) {
            reasons.push(`${dangling.length} relation(s) reference participants not in this Act.`)
        }
    }

    return reasons
}

export function buildPickerItems(args: {
    installedTals: AssetCard[]
    markdownEditors: ReturnType<typeof useStudioStore.getState>['markdownEditors']
    drafts: ReturnType<typeof useStudioStore.getState>['drafts']
    performers: PerformerNode[]
    acts?: WorkspaceAct[]
}): PickerItem[] {
    const items: PickerItem[] = []

    const localTals = args.installedTals.filter((asset) => asset.source === 'stage')
    for (const tal of localTals) {
        const hasContent = typeof tal.content === 'string' && tal.content.trim().length > 0
        items.push({ kind: 'tal', source: 'local', urn: tal.urn, name: tal.name, slug: tal.name, issue: hasContent ? undefined : 'Empty content' })
    }

    const localTalUrns = new Set(localTals.map((asset) => asset.urn))
    for (const editor of args.markdownEditors) {
        const draft = args.drafts[editor.draftId]
        if (!draft) continue
        if (draft.derivedFrom) {
            if (editor.kind === 'tal' && localTalUrns.has(draft.derivedFrom)) continue
        }
        if (editor.kind !== 'tal' || draft.saveState !== 'saved') continue
        const hasContent = typeof draft.content === 'string' && draft.content.trim().length > 0
        items.push({
            kind: editor.kind,
            source: 'draft',
            editorId: editor.id,
            draftId: editor.draftId,
            name: draft.name || `Untitled ${editor.kind}`,
            issue: hasContent ? undefined : 'Empty content',
        })
    }

    for (const performer of args.performers) {
        if (isPerformerPublishable(performer)) {
            items.push({ kind: 'performer', source: 'canvas', performerId: performer.id, name: performer.name, issue: getPerformerIssue(performer) })
        }
    }

    for (const act of (args.acts || [])) {
        const issue = getActIssue(act)
        items.push({ kind: 'act', source: 'canvas', actId: act.id, name: act.name, issue })
    }

    return items
}

export function buildPerformerPreflight(performer: PerformerNode | null): PerformerPreflightEntry[] {
    if (!performer) return []

    const candidates: PerformerPreflightCandidate[] = [
        ...(performer.talRef ? [{ label: 'Tal', ref: performer.talRef, required: true }] : []),
        ...performer.danceRefs.map((ref, index) => ({ label: `Dance ${index + 1}`, ref, required: false })),
    ]

    return candidates.map((entry) => {
        const urn = registryUrnFromRef(entry.ref)
        if (urn) {
            return { ...entry, status: 'ready' as const, detail: urn }
        }
        if (entry.ref.kind === 'draft') {
            return {
                ...entry,
                status: entry.label === 'Tal' ? 'will_publish' as const : 'draft' as const,
                detail: entry.label === 'Tal' ? 'Will publish from draft' : `draft:${entry.ref.draftId}`,
            }
        }
        return { ...entry, status: 'missing' as const, detail: 'not set' }
    })
}

export function buildMarkdownAssetPayload(markdownEditor: NonNullable<ReturnType<typeof useStudioStore.getState>['markdownEditors'][number]>, draft: NonNullable<ReturnType<typeof useStudioStore.getState>['drafts'][string]>, _slug: string, description: string, tags: string[]) {
    return {
        description: description.trim() || draft.name.trim() || markdownEditor.kind,
        tags,
        content: typeof draft.content === 'string' ? draft.content : '',
    }
}

export function buildPublishFormSeed(args: {
    performer?: PerformerNode | null
    draft?: NonNullable<ReturnType<typeof useStudioStore.getState>['drafts'][string]> | null
    act?: WorkspaceAct | null
    localItem?: PickerItemLocal | null
}): PublishFormSeed | null {
    const { performer, draft, act, localItem } = args

    if (performer) {
        return {
            slug: performer.meta?.authoring?.slug || slugifyAssetName(performer.name),
            description: performer.meta?.authoring?.description || performer.name,
            tagsText: (performer.meta?.authoring?.tags || []).join(', '),
        }
    }

    if (draft) {
        return {
            slug: draft.slug || slugifyAssetName(draft.name),
            description: draft.description || draft.name,
            tagsText: (draft.tags || []).join(', '),
        }
    }

    if (act) {
        return {
            slug: act.meta?.authoring?.slug || slugifyAssetName(act.name),
            description: act.meta?.authoring?.description || act.description || act.name,
            tagsText: (act.meta?.authoring?.tags || []).join(', '),
        }
    }

    if (localItem) {
        return {
            slug: localItem.slug,
            description: localItem.name,
            tagsText: '',
        }
    }

    return null
}

export function buildAuthoringPayloadForPublishApi(asset: {
    description?: string
    tags?: string[]
    payload?: Record<string, unknown>
}) {
    return {
        ...(typeof asset.description === 'string' && asset.description.trim()
            ? { description: asset.description.trim() }
            : {}),
        ...(Array.isArray(asset.tags) ? { tags: asset.tags } : {}),
        ...((asset.payload && typeof asset.payload === 'object') ? asset.payload : {}),
    }
}

// ── Sub-components ──────────────────────────────────────

export function itemDisplayName(item: PickerItem): string {
    return item.name
}

export function PickerSection({ title, items, onPick, icon }: {
    title: string
    items: PickerItem[]
    onPick: (item: PickerItem) => void
    icon: React.ReactNode
}) {
    return (
        <div className="publish-modal__picker-section">
            <div className="publish-modal__picker-section-title">{title}</div>
            {items.map((item, index) => (
                <button
                    key={`${item.kind}-${index}`}
                    className={`publish-modal__picker-item${item.issue ? ' is-warning' : ''}`}
                    onClick={() => onPick(item)}
                >
                    <span className="publish-modal__picker-item-icon">{icon}</span>
                    <span className="publish-modal__picker-item-name">{itemDisplayName(item)}</span>
                    {item.issue ? (
                        <span className="publish-modal__picker-item-issue">{item.issue}</span>
                    ) : (
                        <span className="publish-modal__picker-item-badge">
                            {item.source === 'draft' ? 'unsaved' : item.source === 'local' ? 'saved' : ''}
                        </span>
                    )}
                </button>
            ))}
        </div>
    )
}
