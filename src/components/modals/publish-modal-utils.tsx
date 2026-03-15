/**
 * publish-modal-utils.tsx – Pure helpers, types, and sub-components
 * extracted from PublishModal.tsx.
 *
 * Contains: type definitions, publishability helpers, picker-item builders,
 * preflight builders, and the PickerSection presentational component.
 */

import type { PerformerNode, StageAct } from '../../types'
import { useStudioStore } from '../../store'
import { registryUrnFromRef } from '../../lib/performers'
import { resolvePublishablePerformerUrn } from '../../lib/acts'

// ── Types ───────────────────────────────────────────────

export type PickerItemLocal = { kind: 'tal' | 'dance'; source: 'local'; urn: string; name: string; slug: string; issue?: string }
export type PickerItemDraft = { kind: 'tal' | 'dance'; source: 'draft'; editorId: string; draftId: string; name: string; issue?: string }
export type PickerItemPerformer = { kind: 'performer'; source: 'canvas'; performerId: string; name: string; issue?: string }
export type PickerItemAct = { kind: 'act'; source: 'canvas'; actId: string; name: string; issue?: string }
export type PickerItem = PickerItemLocal | PickerItemDraft | PickerItemPerformer | PickerItemAct

export type PerformerPreflightEntry = {
    label: string
    required: boolean
    status: 'ready' | 'draft' | 'missing'
    detail: string
}

export type ActPreflightEntry = {
    nodeId: string
    performerName: string
    status: 'ready' | 'missing'
    detail: string
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

export function isActPublishable(a: StageAct): boolean {
    if (!a.meta?.derivedFrom) return true
    if (a.meta.authoring?.slug || a.meta.authoring?.description || (a.meta.authoring?.tags && a.meta.authoring.tags.length > 0)) return true
    return false
}

export function getActIssue(a: StageAct, allPerformers: PerformerNode[]): string | undefined {
    if (a.nodes.length === 0) {
        return 'No nodes'
    }
    if (a.nodes.length < 2) {
        return 'Needs at least 2 nodes'
    }
    const unbound = a.nodes.filter((n: any) => !n.performerId)
    if (unbound.length === a.nodes.length) {
        return 'No performers assigned'
    }
    const allEmpty = a.nodes.every((n: any) => {
        if (!n.performerId) return true
        const p = allPerformers.find((perf) => perf.id === n.performerId)
        return p ? !!getPerformerIssue(p) : true
    })
    if (allEmpty) {
        return 'All performers are incomplete'
    }
    return undefined
}

export function buildPickerItems(args: {
    installedTals: any[]
    installedDances: any[]
    markdownEditors: ReturnType<typeof useStudioStore.getState>['markdownEditors']
    drafts: ReturnType<typeof useStudioStore.getState>['drafts']
    performers: PerformerNode[]
    acts: StageAct[]
}): PickerItem[] {
    const items: PickerItem[] = []

    const localTals = args.installedTals.filter((asset) => asset.source === 'stage')
    for (const tal of localTals) {
        const hasContent = typeof tal.content === 'string' && tal.content.trim().length > 0
        items.push({ kind: 'tal', source: 'local', urn: tal.urn, name: tal.name, slug: tal.name, issue: hasContent ? undefined : 'Empty content' })
    }

    const localDances = args.installedDances.filter((asset) => asset.source === 'stage')
    for (const dance of localDances) {
        const hasContent = typeof dance.content === 'string' && dance.content.trim().length > 0
        items.push({ kind: 'dance', source: 'local', urn: dance.urn, name: dance.name, slug: dance.name, issue: hasContent ? undefined : 'Empty content' })
    }

    const localTalUrns = new Set(localTals.map((asset) => asset.urn))
    const localDanceUrns = new Set(localDances.map((asset) => asset.urn))
    for (const editor of args.markdownEditors) {
        const draft = args.drafts[editor.draftId]
        if (!draft) continue
        if (draft.derivedFrom) {
            if (editor.kind === 'tal' && localTalUrns.has(draft.derivedFrom)) continue
            if (editor.kind === 'dance' && localDanceUrns.has(draft.derivedFrom)) continue
        }
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
        if (performer.ownerActId) continue
        if (isPerformerPublishable(performer)) {
            items.push({ kind: 'performer', source: 'canvas', performerId: performer.id, name: performer.name, issue: getPerformerIssue(performer) })
        }
    }

    for (const act of args.acts) {
        if (isActPublishable(act)) {
            items.push({ kind: 'act', source: 'canvas', actId: act.id, name: act.name, issue: getActIssue(act, args.performers) })
        }
    }

    return items
}

export function buildPerformerPreflight(performer: PerformerNode | null): PerformerPreflightEntry[] {
    if (!performer) return []

    return [
        performer.talRef ? { label: 'Tal', ref: performer.talRef, required: true } : null,
        ...performer.danceRefs.map((ref, index) => ({ label: `Dance ${index + 1}`, ref, required: false })),
    ]
        .filter(Boolean)
        .map((entry: any) => {
            const urn = registryUrnFromRef(entry.ref)
            if (urn) {
                return { ...entry, status: 'ready' as const, detail: urn }
            }
            if (entry.ref?.kind === 'draft') {
                return { ...entry, status: 'draft' as const, detail: `draft:${entry.ref.draftId}` }
            }
            return { ...entry, status: 'missing' as const, detail: 'not set' }
        })
}

export function buildActPreflight(
    act: StageAct | null,
    performers: PerformerNode[],
    installedPerformers: any[],
    author: string | null,
): ActPreflightEntry[] {
    if (!act) return []

    const savedPerformerUrns = new Set(
        installedPerformers
            .filter((asset) => asset.source === 'stage')
            .map((asset) => asset.urn),
    )

    return act.nodes
        .map((node: any) => {
            const boundPerformer = performers.find((item) => item.id === node.performerId)
            const performerUrn = resolvePublishablePerformerUrn(boundPerformer, author, {
                savedPerformerUrns,
            })
            return {
                nodeId: node.id,
                performerName: boundPerformer?.name || 'Unassigned',
                status: performerUrn ? 'ready' as const : 'missing' as const,
                detail: performerUrn || 'Save or publish this performer before publishing the act.',
            }
        })
}

export function buildMarkdownAssetPayload(markdownEditor: NonNullable<ReturnType<typeof useStudioStore.getState>['markdownEditors'][number]>, draft: NonNullable<ReturnType<typeof useStudioStore.getState>['drafts'][string]>, slug: string, description: string, tags: string[]) {
    return {
        name: draft.name.trim() || (markdownEditor.kind === 'tal' ? 'Untitled Tal' : 'Untitled Dance'),
        slug: slug.trim(),
        description: description.trim() || draft.name.trim() || markdownEditor.kind,
        tags,
        content: typeof draft.content === 'string' ? draft.content : '',
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
