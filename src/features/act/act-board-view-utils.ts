import type { PerformerNode, WorkspaceAct } from '../../types'
import { resolveActParticipantLabel } from './participant-labels'

export interface BoardEntryLike {
    kind: 'artifact' | 'finding' | 'task' | 'note'
}

export interface ActivityEventLike {
    id: string
    type: string
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

export type FilterKind = 'artifact' | 'finding' | 'task'

export const FILTER_KINDS: FilterKind[] = ['artifact', 'finding', 'task']

export const KIND_LABELS: Record<FilterKind, string> = {
    artifact: 'Artifacts',
    finding: 'Findings',
    task: 'Tasks',
}

function resolveParticipantKeyLabel(
    act: WorkspaceAct | null | undefined,
    performers: PerformerNode[],
    value: string,
) {
    if (!act?.participants?.[value]) return value
    return resolveActParticipantLabel(act, value, performers)
}

export function resolveBoardActorLabel(
    act: WorkspaceAct | null | undefined,
    performers: PerformerNode[],
    actor: string,
) {
    return resolveParticipantKeyLabel(act, performers, actor)
}

function payloadString(payload: Record<string, unknown>, key: string) {
    const value = payload[key]
    return typeof value === 'string' && value.trim() ? value : null
}

export function getEventDescription(
    event: ActivityEventLike,
    act: WorkspaceAct | null | undefined,
    performers: PerformerNode[],
) {
    const source = resolveParticipantKeyLabel(act, performers, event.source)
    const to = payloadString(event.payload, 'to')
    const key = payloadString(event.payload, 'key')
    const tag = payloadString(event.payload, 'tag')
    const target = to ? resolveParticipantKeyLabel(act, performers, to) : null

    switch (event.type) {
        case 'message.sent':
            return `${source} -> ${target || 'unknown'}${tag ? ` [${tag}]` : ''}`
        case 'message.delivered':
            return `${target || 'unknown'} <- ${source}`
        case 'board.posted':
        case 'board.updated':
            return key ? `${source} updated "${key}"` : `${source} updated the board`
        case 'runtime.idle':
            return 'Runtime idle'
        default:
            return `${source}: ${event.type}`
    }
}

export function boardEntryMatchesFilter(entry: BoardEntryLike, filter: FilterKind) {
    if (filter === 'artifact') return entry.kind === 'artifact' || entry.kind === 'note'
    return entry.kind === filter
}

export function filterBoardEntries<T extends BoardEntryLike>(entries: T[], filter: FilterKind) {
    return entries.filter((entry) => boardEntryMatchesFilter(entry, filter))
}

export function mergeActivityPages<T extends ActivityEventLike>(
    current: T[],
    incoming: T[],
    mode: 'prependLatest' | 'appendOlder',
) {
    const seen = new Set<string>()
    const ordered = mode === 'prependLatest'
        ? [...incoming, ...current]
        : [...current, ...incoming]

    return ordered
        .filter((event) => {
            if (seen.has(event.id)) return false
            seen.add(event.id)
            return true
        })
        .sort((left, right) => right.timestamp - left.timestamp)
}

export function getBoardKindCounts<T extends BoardEntryLike>(entries: T[]) {
    return FILTER_KINDS.reduce<Record<FilterKind, number>>((counts, kind) => {
        counts[kind] = filterBoardEntries(entries, kind).length
        return counts
    }, {
        artifact: 0,
        finding: 0,
        task: 0,
    })
}
