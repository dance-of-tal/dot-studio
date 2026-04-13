/**
 * Performer configuration mutations extracted from workspaceSlice.
 *
 * Contains all Tal, Dance, Model, MCP, and agent-config setters.
 * Each function produces a Zustand partial that workspaceSlice
 * spreads directly into its returned object.
 */

import type { StudioState } from './types'
import type { AssetRef } from '../types'
import {
    assetRefKey,
    isSameAssetRef,
} from '../lib/performers'
import {
    applyPerformerPatch,
    mapPerformers,
} from './workspace-helpers'
import { buildExitFocusModeState } from './workspace-focus-actions'
import { isPerformerAttachedToAct } from '../features/act/act-inspector-helpers'
import {
    resolveFocusTarget,
    resolveNodeBaselineHidden,
    setFocusSnapshotNodeHidden,
} from '../lib/focus-utils'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState
const LIVE_ACT_WORKSPACE_PERSIST_DELAY_MS = 300
const liveActWorkspacePersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * After a runtime-affecting performer mutation, if the performer participates
 * in a live Act, persist workspace so auto-wake and participant execution
 * read the latest performer config from workspace.json.
 *
 * Performer runtime config changes do not alter Act definitions, so this path
 * intentionally avoids Act runtime-definition sync and only saves workspace.
 */
function scheduleLiveActWorkspacePersist(get: GetFn, performerId: string) {
    const state = get()
    const performer = state.performers.find((p) => p.id === performerId)
    if (!performer) return

    const isAttachedToLiveAct = state.acts.some((act) => {
        if (!isPerformerAttachedToAct(act, performer)) {
            return false
        }
        return (state.actThreads[act.id] || []).some(
            (thread) => thread.status === 'active' || thread.status === 'idle',
        )
    })

    if (!isAttachedToLiveAct) {
        const existing = liveActWorkspacePersistTimers.get(performerId)
        if (existing) {
            clearTimeout(existing)
            liveActWorkspacePersistTimers.delete(performerId)
        }
        return
    }

    const existing = liveActWorkspacePersistTimers.get(performerId)
    if (existing) {
        clearTimeout(existing)
    }

    liveActWorkspacePersistTimers.set(performerId, setTimeout(() => {
        liveActWorkspacePersistTimers.delete(performerId)
        const latest = get()
        const latestPerformer = latest.performers.find((p) => p.id === performerId)
        if (!latestPerformer) {
            return
        }

        const stillAttachedToLiveAct = latest.acts.some((act) => {
            if (!isPerformerAttachedToAct(act, latestPerformer)) {
                return false
            }
            return (latest.actThreads[act.id] || []).some(
                (thread) => thread.status === 'active' || thread.status === 'idle',
            )
        })

        if (!stillAttachedToLiveAct || !latest.workspaceDirty) {
            return
        }

        void latest.saveWorkspace().catch((error) => {
            console.warn('[act-sync] Failed to persist workspace for live Act performer update', error)
        })
    }, LIVE_ACT_WORKSPACE_PERSIST_DELAY_MS))
}

function markPerformerProjectionDirty(get: GetFn, performerId: string) {
    get().recordStudioChange({ kind: 'performer', performerIds: [performerId] })
}

// ── Tal ─────────────────────────────────────────────────

export function setPerformerTal(set: SetFn, get: GetFn, performerId: string, tal: { urn?: string } | null) {
    set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                talRef: tal?.urn ? { kind: 'registry' as const, urn: tal.urn } : null,
            })
        }),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function setPerformerTalRef(set: SetFn, get: GetFn, performerId: string, talRef: AssetRef | null) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, { talRef })),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

// ── Dance ───────────────────────────────────────────────

export function addPerformerDance(set: SetFn, get: GetFn, performerId: string, dance: { urn: string }) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.danceRefs.some((ref) => ref.kind === 'registry' && ref.urn === dance.urn)
                ? applyPerformerPatch(a, {
                    danceRefs: [...a.danceRefs, { kind: 'registry' as const, urn: dance.urn }],
                })
                : a
        ),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function addPerformerDanceRef(set: SetFn, get: GetFn, performerId: string, danceRef: AssetRef) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => (
            !performer.danceRefs.some((ref) => isSameAssetRef(ref, danceRef))
                ? applyPerformerPatch(performer, {
                    danceRefs: [...performer.danceRefs, danceRef],
                })
                : performer
        )),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function replacePerformerDanceRef(set: SetFn, get: GetFn, performerId: string, currentRef: AssetRef, nextRef: AssetRef) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, {
            danceRefs: performer.danceRefs.map((ref) => (isSameAssetRef(ref, currentRef) ? nextRef : ref)),
        })),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function removePerformerDance(set: SetFn, get: GetFn, performerId: string, danceUrn: string) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId
                ? (() => {
                    const danceRefs = a.danceRefs.filter((ref) => (
                        assetRefKey(ref) !== danceUrn
                        && !(ref.kind === 'registry' && ref.urn === danceUrn)
                        && !(ref.kind === 'draft' && ref.draftId === danceUrn)
                    ))
                    return applyPerformerPatch(a, { danceRefs })
                })()
                : a
        ),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

// ── Model ───────────────────────────────────────────────

export function setPerformerModel(set: SetFn, get: GetFn, performerId: string, model: { provider: string; modelId: string } | null) {
    set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            const sameModel = (
                (a.model?.provider || null) === (model?.provider || null)
                && (a.model?.modelId || null) === (model?.modelId || null)
            )
            return applyPerformerPatch(a, {
                model,
                modelVariant: sameModel ? (a.modelVariant || null) : null,
                modelPlaceholder: null,
            })
        }),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function setPerformerModelVariant(set: SetFn, get: GetFn, performerId: string, modelVariant: string | null) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, { modelVariant: modelVariant || null })),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

// ── Agent ───────────────────────────────────────────────

export function setPerformerAgentId(set: SetFn, get: GetFn, performerId: string, agentId: string | null) {
    set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                agentId: agentId || null,
                planMode: agentId === 'plan',
            })
        }),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

// ── MCP ─────────────────────────────────────────────────

export function addPerformerMcp(set: SetFn, get: GetFn, performerId: string, mcp: { name: string }) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.mcpServerNames.includes(mcp.name)
                ? (() => {
                    return applyPerformerPatch(a, { mcpServerNames: [...a.mcpServerNames, mcp.name] })
                })()
                : a
        ),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function removePerformerMcp(set: SetFn, get: GetFn, performerId: string, mcpName: string) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId
                ? (() => {
                    const mcpServerNames = a.mcpServerNames.filter(name => name !== mcpName)
                    const mcpBindingMap = Object.fromEntries(
                        Object.entries(a.mcpBindingMap || {}).filter(([, serverName]) => serverName !== mcpName),
                    )
                    return applyPerformerPatch(a, { mcpServerNames, mcpBindingMap })
                })()
                : a
        ),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function setPerformerMcpBinding(set: SetFn, get: GetFn, performerId: string, placeholderName: string, serverName: string | null) {
    set((s) => ({
        performers: s.performers.map((performer) => {
            if (performer.id !== performerId) {
                return performer
            }
            const mcpBindingMap = {
                ...(performer.mcpBindingMap || {}),
            }
            if (serverName && serverName.trim()) {
                mcpBindingMap[placeholderName] = serverName.trim()
            } else {
                delete mcpBindingMap[placeholderName]
            }
            return applyPerformerPatch(performer, { mcpBindingMap })
        }),
        workspaceDirty: true,
    }))
    markPerformerProjectionDirty(get, performerId)
    scheduleLiveActWorkspacePersist(get, performerId)
}

// ── Metadata & visibility ───────────────────────────────

export function updatePerformerAuthoringMeta(set: SetFn, get: GetFn, performerId: string, patch: Record<string, unknown>) {
    set((s) => ({
        performers: s.performers.map((a) => (
            a.id === performerId
                ? {
                    ...a,
                    meta: {
                        ...a.meta,
                        authoring: {
                            ...(a.meta?.authoring || {}),
                            ...patch,
                        },
                    },
                }
                : a
        )),
        workspaceDirty: true,
    }))
    scheduleLiveActWorkspacePersist(get, performerId)
}

export function togglePerformerVisibility(set: SetFn, _get: GetFn, id: string) {
    set((state) => {
        const focusedTarget = resolveFocusTarget(state.focusSnapshot)
        const currentHidden = resolveNodeBaselineHidden(
            state.focusSnapshot,
            id,
            'performer',
            !!state.performers.find((performer) => performer.id === id)?.hidden,
        )
        const nextHidden = !currentHidden

        if (state.focusSnapshot && (focusedTarget?.id !== id || focusedTarget?.type !== 'performer')) {
            return {
                focusSnapshot: setFocusSnapshotNodeHidden(state.focusSnapshot, id, 'performer', nextHidden),
                workspaceDirty: true,
            }
        }

        const focusExit = buildExitFocusModeState(state)
        const performers = (focusExit?.performers as StudioState['performers'] | undefined) || state.performers

        return {
            ...focusExit,
            performers: performers.map((performer) => (
                performer.id === id
                    ? { ...performer, hidden: nextHidden }
                    : performer
            )),
            workspaceDirty: true,
        }
    })
}
