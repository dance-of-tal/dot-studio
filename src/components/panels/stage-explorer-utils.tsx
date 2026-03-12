/**
 * stage-explorer-utils.ts – Pure helpers, types, and sub-components
 * extracted from StageExplorer.tsx.
 *
 * Contains: types, data-building functions (session groupers, thread-row builder),
 * and presentational sub-components (LayerRow, SessionNameEditor, SessionRowActions).
 */

import type { ReactNode } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { ActSessionRecord, PerformerNode, StageAct } from '../../types'
import { parseStudioSessionTitle } from '../../../shared/session-metadata'

// ── Types ───────────────────────────────────────────────

export type PerformerSessionRecord = {
    id: string
    title?: string
    createdAt?: number
}

export type PerformerSessionRow = {
    session: PerformerSessionRecord
    performerId: string
    active: boolean
}

export type ExplorerRenamingSession = null | {
    key: string
    kind: 'performer' | 'act'
    sessionId: string
    currentTitle?: string
    value: string
}

export type ThreadRow =
    | {
        id: string
        kind: 'performer'
        label: string
        meta: string
        hidden: boolean
        active: boolean
        children: PerformerSessionRow[]
    }
    | {
        id: string
        kind: 'act'
        label: string
        meta: string
        hidden: boolean
        active: boolean
        children: ActSessionRecord[]
    }

// ── Pure helpers ────────────────────────────────────────

export function stageLabel(workingDir: string) {
    const normalized = workingDir.trim().replace(/\/+$/, '')
    return normalized.split(/[/\\]/).pop() || 'Working Directory'
}

export function actSessionTone(status: string): 'default' | 'success' | 'warn' | 'danger' {
    switch (status) {
        case 'completed':
            return 'success'
        case 'interrupted':
            return 'warn'
        case 'failed':
            return 'danger'
        default:
            return 'default'
    }
}

export function buildPerformerSessionRows(
    sessions: PerformerSessionRecord[],
    performers: PerformerNode[],
    sessionMap: Record<string, string>,
): PerformerSessionRow[] {
    const rows = sessions
        .map((session) => {
            const metadata = parseStudioSessionTitle(session.title)
            const performerId = metadata?.performerId || null
            const performer = performerId ? performers.find((item) => item.id === performerId) || null : null
            if (!performer) {
                return null
            }
            return {
                session,
                performerId,
                active: sessionMap[performer.id] === session.id,
            }
        })
        .filter((entry): entry is PerformerSessionRow => !!entry && typeof entry.performerId === 'string')

    const seen = new Set<string>()
    return rows.filter((entry) => {
        if (seen.has(entry.session.id)) {
            return false
        }
        seen.add(entry.session.id)
        return true
    })
}

export function groupPerformerSessionsById(performerSessionRows: PerformerSessionRow[]) {
    const map = new Map<string, PerformerSessionRow[]>()
    performerSessionRows.forEach((entry) => {
        const current = map.get(entry.performerId) || []
        current.push(entry)
        map.set(entry.performerId, current)
    })
    map.forEach((entries, performerId) => {
        map.set(performerId, [...entries].sort((left, right) => (right.session.createdAt || 0) - (left.session.createdAt || 0)))
    })
    return map
}

export function groupActSessionsByActId(actSessions: ActSessionRecord[]) {
    const map = new Map<string, ActSessionRecord[]>()
        ;[...actSessions]
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .forEach((session) => {
                const current = map.get(session.actId) || []
                current.push(session)
                map.set(session.actId, current)
            })
    return map
}

export function buildLatestActSessionMap(
    actSessionMap: Record<string, string>,
    actSessionsByActId: Map<string, ActSessionRecord[]>,
) {
    const map = new Map<string, { status: string }>()
    actSessionsByActId.forEach((sessionsForAct, actId) => {
        const currentSessionId = actSessionMap[actId]
        const currentSession = currentSessionId
            ? sessionsForAct.find((session) => session.id === currentSessionId) || sessionsForAct[0]
            : sessionsForAct[0]
        if (currentSession) {
            map.set(actId, { status: currentSession.status })
        }
    })
    return map
}

export function buildThreadRows(args: {
    sharedPerformers: PerformerNode[]
    acts: StageAct[]
    editingTarget: { type: 'performer' | 'act'; id: string } | null
    latestActSessionMap: Map<string, { status: string }>
    performerSessionsById: Map<string, PerformerSessionRow[]>
    actSessionsByActId: Map<string, ActSessionRecord[]>
    selectedPerformerId: string | null
    selectedPerformerSessionId: string | null
    selectedActId: string | null
    selectedActSessionId: string | null
}): ThreadRow[] {
    const performerRows: ThreadRow[] = args.sharedPerformers.map((performer) => ({
        id: performer.id,
        kind: 'performer',
        label: performer.name,
        meta: performer.model?.modelId || 'No model selected',
        hidden: !!performer.hidden,
        active: ((args.selectedPerformerId === performer.id) || (args.editingTarget?.type === 'performer' && args.editingTarget.id === performer.id))
            && !args.selectedPerformerSessionId,
        children: args.performerSessionsById.get(performer.id) || [],
    }))

    const actRows: ThreadRow[] = args.acts.map((act) => {
        const latestSession = args.latestActSessionMap.get(act.id)
        return {
            id: act.id,
            kind: 'act',
            label: act.name,
            meta: latestSession ? `${latestSession.status} · ${act.nodes.length} nodes` : `${act.nodes.length} nodes`,
            hidden: !!act.hidden,
            active: ((args.selectedActId === act.id) || (args.editingTarget?.type === 'act' && args.editingTarget.id === act.id))
                && !args.selectedActSessionId,
            children: args.actSessionsByActId.get(act.id) || [],
        }
    })

    return [...performerRows, ...actRows]
}

// ── Sub-components ──────────────────────────────────────

export function LayerRow({
    icon,
    label,
    meta,
    metaTone = 'default',
    active = false,
    onClick,
    actions,
    muted = false,
}: {
    icon: ReactNode
    label: ReactNode
    meta?: string
    metaTone?: 'default' | 'success' | 'warn' | 'danger'
    active?: boolean
    muted?: boolean
    onClick?: () => void
    actions?: ReactNode
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`layer-row ${active ? 'active' : ''} ${muted ? 'muted' : ''}`}
            onClick={onClick}
            onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && onClick) {
                    event.preventDefault()
                    onClick()
                }
            }}
        >
            <span className="layer-row__icon">{icon}</span>
            <span className="layer-row__body">
                <span className="layer-row__label">{label}</span>
                {meta ? (
                    <span className={`layer-row__meta layer-row__meta--${metaTone}`}>
                        {meta}
                    </span>
                ) : null}
            </span>
            {actions ? (
                <span
                    className="layer-row__actions"
                    onClick={(event) => event.stopPropagation()}
                >
                    {actions}
                </span>
            ) : null}
        </div>
    )
}

export function SessionNameEditor({
    renaming,
    display,
    onChange,
    onCommit,
    onCancel,
}: {
    renaming: ExplorerRenamingSession
    display: ReactNode
    onChange: (value: string) => void
    onCommit: () => void
    onCancel: () => void
}) {
    if (!renaming) {
        return <>{display}</>
    }

    return (
        <input
            autoFocus
            className="thread-inline-input"
            value={renaming.value}
            onChange={(event) => onChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    onCommit()
                } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancel()
                }
            }}
        />
    )
}

export function SessionRowActions({
    renaming,
    onCommit,
    onCancel,
    onRename,
    onDelete,
    renameTitle,
    deleteTitle,
}: {
    renaming: ExplorerRenamingSession
    onCommit: () => void
    onCancel: () => void
    onRename: () => void
    onDelete: () => void
    renameTitle: string
    deleteTitle: string
}) {
    if (renaming) {
        return (
            <>
                <button className="icon-btn" onClick={onCommit} title="Save name">
                    <Check size={10} />
                </button>
                <button className="icon-btn" onClick={onCancel} title="Cancel rename">
                    <X size={10} />
                </button>
            </>
        )
    }

    return (
        <>
            <button className="icon-btn" onClick={onRename} title={renameTitle}>
                <Pencil size={10} />
            </button>
            <button className="icon-btn remove-btn" onClick={onDelete} title={deleteTitle}>
                <Trash2 size={10} />
            </button>
        </>
    )
}
