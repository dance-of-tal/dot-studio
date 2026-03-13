import type { AssetCard, AssetRef, DraftAsset } from '../../types'
import { assetRefKey } from '../../lib/performers'
import type { FileMention } from '../../hooks/useFileMentions'

// ── Types ──────────────────────────────────────────────

export type TurnDanceSelection = {
    ref: AssetRef
    label: string
    scope: 'performer' | 'draft' | 'stage' | 'global'
}

export type DanceSearchItem = {
    key: string
    ref: AssetRef
    label: string
    scope: 'performer' | 'draft' | 'stage' | 'global'
    subtitle: string
}

// ── Pure Utility Functions ─────────────────────────────

export function formatAgentLabel(name: string | null | undefined) {
    if (!name) {
        return null;
    }
    return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(' ');
}

export function assetRefDisplayLabel(ref: AssetRef, drafts: Record<string, DraftAsset>) {
    if (ref.kind === 'draft') {
        const draft = drafts[ref.draftId]
        return draft?.name || draft?.slug || `Draft ${ref.draftId.slice(0, 8)}`
    }
    return ref.urn.split('/').pop() || ref.urn
}

export function danceSearchText(label: string, subtitle: string, scope: DanceSearchItem['scope']) {
    return `${label} ${subtitle} ${scope}`.toLowerCase()
}

export function buildAttachedDraftDanceItems(
    performer: { danceRefs?: AssetRef[] } | null,
    drafts: Record<string, DraftAsset>,
): DanceSearchItem[] {
    return (performer?.danceRefs || [])
        .filter((ref) => ref.kind === 'draft')
        .map((ref) => ({
            key: `draft:${assetRefKey(ref) || Math.random().toString(36).slice(2)}`,
            ref,
            label: assetRefDisplayLabel(ref, drafts),
            scope: 'draft' as const,
            subtitle: 'Attached to performer',
        }))
}

export function buildStandaloneDraftDanceItems(
    performer: { danceRefs?: AssetRef[] } | null,
    drafts: Record<string, DraftAsset>,
): DanceSearchItem[] {
    const attachedDraftIds = new Set(
        (performer?.danceRefs || [])
            .filter((ref) => ref.kind === 'draft')
            .map((ref) => ref.draftId),
    )

    return Object.entries(drafts)
        .filter(([id, draft]) => draft.kind === 'dance' && !attachedDraftIds.has(id))
        .map(([id, draft]) => ({
            key: `draft:${id}`,
            ref: { kind: 'draft' as const, draftId: id },
            label: draft.name || draft.slug || `Draft ${id.slice(0, 8)}`,
            scope: 'draft' as const,
            subtitle: 'Unsaved draft',
        }))
}

export function buildPerformerDanceItems(
    performer: { danceRefs?: AssetRef[] } | null,
    drafts: Record<string, DraftAsset>,
): DanceSearchItem[] {
    return (performer?.danceRefs || [])
        .filter((ref) => ref.kind !== 'draft')
        .map((ref) => ({
            key: `performer:${assetRefKey(ref) || Math.random().toString(36).slice(2)}`,
            ref,
            label: assetRefDisplayLabel(ref, drafts),
            scope: 'performer' as const,
            subtitle: ref.urn || '',
        }))
}

export function buildAvailableDanceItems(
    danceAssets: AssetCard[],
    drafts: Record<string, DraftAsset>,
    performer: { danceRefs?: AssetRef[] } | null,
): DanceSearchItem[] {
    const draftItems = [
        ...buildAttachedDraftDanceItems(performer, drafts),
        ...buildStandaloneDraftDanceItems(performer, drafts),
    ]
    const performerItems = buildPerformerDanceItems(performer, drafts)
    const performerKeys = new Set(
        [...draftItems, ...performerItems]
            .map((item) => assetRefKey(item.ref))
            .filter((key): key is string => !!key),
    )

    return danceAssets
        .filter((asset): asset is AssetCard => asset.kind === 'dance')
        .map((asset) => ({
            key: `${asset.source || 'local'}:${asset.urn}`,
            ref: { kind: 'registry', urn: asset.urn } as const,
            label: asset.name,
            scope: asset.source === 'global' ? 'global' as const : 'stage' as const,
            subtitle: asset.urn,
        }))
        .filter((item) => !performerKeys.has(assetRefKey(item.ref) || ''))
}

export function buildDanceSearchSections(
    danceAssets: AssetCard[],
    danceSlashMatch: string | null,
    drafts: Record<string, DraftAsset>,
    performer: { danceRefs?: AssetRef[] } | null,
) {
    const draftItems = [
        ...buildAttachedDraftDanceItems(performer, drafts),
        ...buildStandaloneDraftDanceItems(performer, drafts),
    ]
    const performerItems = buildPerformerDanceItems(performer, drafts)
    const availableItems = buildAvailableDanceItems(danceAssets, drafts, performer)
    const byQuery = (item: DanceSearchItem) => (
        !danceSlashMatch
        || danceSearchText(item.label, item.subtitle, item.scope).includes(danceSlashMatch)
    )

    return [
        {
            key: 'draft',
            title: 'Draft',
            items: draftItems.filter(byQuery),
        },
        {
            key: 'performer',
            title: 'Performer',
            items: performerItems.filter(byQuery),
        },
        {
            key: 'stage',
            title: 'Stage',
            items: availableItems.filter((item) => item.scope === 'stage').filter(byQuery),
        },
        {
            key: 'global',
            title: 'Global',
            items: availableItems.filter((item) => item.scope === 'global').filter(byQuery),
        },
    ].filter((section) => section.items.length > 0)
}

export function formatChatAttachments(attachments: FileMention[]) {
    return attachments.map((attachment) => ({
        type: 'file' as const,
        mime: attachment.type || 'text/plain',
        url: attachment.absolute.startsWith('data:') ? attachment.absolute : `file://${attachment.absolute}`,
        filename: attachment.name,
    }))
}

export function shouldShowChatLoading(messages: Array<{ role: string; content: string }>, isLoading: boolean) {
    if (!isLoading) {
        return false
    }
    const lastMsg = messages[messages.length - 1]
    const hasStreamingContent = lastMsg?.role === 'assistant' && lastMsg.content.trim().length > 0
    return !hasStreamingContent
}
