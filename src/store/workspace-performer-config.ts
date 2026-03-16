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

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void

// ── Tal ─────────────────────────────────────────────────

export function setPerformerTal(set: SetFn, performerId: string, tal: { urn?: string } | null) {
    set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                talRef: tal?.urn ? { kind: 'registry' as const, urn: tal.urn } : null,
            })
        }),
        stageDirty: true,
    }))
}

export function setPerformerTalRef(set: SetFn, performerId: string, talRef: AssetRef | null) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, { talRef })),
        stageDirty: true,
    }))
}

// ── Dance ───────────────────────────────────────────────

export function addPerformerDance(set: SetFn, performerId: string, dance: { urn: string }) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.danceRefs.some((ref) => ref.kind === 'registry' && ref.urn === dance.urn)
                ? applyPerformerPatch(a, {
                    danceRefs: [...a.danceRefs, { kind: 'registry' as const, urn: dance.urn }],
                })
                : a
        ),
        stageDirty: true,
    }))
}

export function addPerformerDanceRef(set: SetFn, performerId: string, danceRef: AssetRef) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => (
            !performer.danceRefs.some((ref: any) => isSameAssetRef(ref, danceRef))
                ? applyPerformerPatch(performer, {
                    danceRefs: [...performer.danceRefs, danceRef],
                })
                : performer
        )),
        stageDirty: true,
    }))
}

export function replacePerformerDanceRef(set: SetFn, performerId: string, currentRef: AssetRef, nextRef: AssetRef) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, {
            danceRefs: performer.danceRefs.map((ref: any) => (isSameAssetRef(ref, currentRef) ? nextRef : ref)),
        })),
        stageDirty: true,
    }))
}

export function removePerformerDance(set: SetFn, performerId: string, danceUrn: string) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId
                ? (() => {
                    const danceRefs = a.danceRefs.filter((ref) => assetRefKey(ref) !== danceUrn && !(ref.kind === 'registry' && ref.urn === danceUrn))
                    return applyPerformerPatch(a, { danceRefs })
                })()
                : a
        ),
        stageDirty: true,
    }))
}

// ── Model ───────────────────────────────────────────────

export function setPerformerModel(set: SetFn, performerId: string, model: { provider: string; modelId: string } | null) {
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
        stageDirty: true,
    }))
}

export function setPerformerModelVariant(set: SetFn, performerId: string, modelVariant: string | null) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, { modelVariant: modelVariant || null })),
        stageDirty: true,
    }))
}

// ── Agent ───────────────────────────────────────────────

export function setPerformerAgentId(set: SetFn, performerId: string, agentId: string | null) {
    set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                agentId: agentId || null,
                planMode: agentId === 'plan',
            })
        }),
        stageDirty: true,
    }))
}

export function setPerformerDanceDeliveryMode(set: SetFn, performerId: string, danceDeliveryMode: string) {
    set((s) => ({
        performers: mapPerformers(s.performers, performerId, (performer) => applyPerformerPatch(performer, { danceDeliveryMode })),
        stageDirty: true,
    }))
}

// ── MCP ─────────────────────────────────────────────────

export function addPerformerMcp(set: SetFn, performerId: string, mcp: { name: string }) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.mcpServerNames.includes(mcp.name)
                ? (() => {
                    return applyPerformerPatch(a, { mcpServerNames: [...a.mcpServerNames, mcp.name] })
                })()
                : a
        ),
        stageDirty: true,
    }))
}

export function removePerformerMcp(set: SetFn, performerId: string, mcpName: string) {
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
        stageDirty: true,
    }))
}

export function setPerformerMcpBinding(set: SetFn, performerId: string, placeholderName: string, serverName: string | null) {
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
        stageDirty: true,
    }))
}

// ── Metadata & visibility ───────────────────────────────

export function updatePerformerAuthoringMeta(set: SetFn, performerId: string, patch: Record<string, unknown>) {
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
        stageDirty: true,
    }))
}

export function togglePerformerVisibility(set: SetFn, id: string) {
    set((s) => ({
        performers: s.performers.map(a =>
            a.id === id ? { ...a, hidden: !a.hidden } : a
        ),
        stageDirty: true,
    }))
}
