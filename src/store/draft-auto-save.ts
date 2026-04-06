/**
 * draft-auto-save.ts — Zustand subscriber that auto-saves
 * performer config changes as drafts when the performer is
 * derived from a named asset.
 *
 * Import this module in the store index to activate.
 */

import { api } from '../api'
import type { PerformerNode } from '../types'
import type { StudioState } from './types'

const _timers = new Map<string, ReturnType<typeof setTimeout>>()
const _hashes = new Map<string, string>()
const DEBOUNCE_MS = 2000

function configHash(p: PerformerNode): string {
    return JSON.stringify({
        talRef: p.talRef,
        danceRefs: p.danceRefs,
        model: p.model,
        modelVariant: p.modelVariant,
        mcpServerNames: p.mcpServerNames,
        mcpBindingMap: p.mcpBindingMap,
        planMode: p.planMode,
        agentId: p.agentId,
    })
}

/**
 * Initialize the auto-save subscriber. Call once after the store is created.
 */
export function initDraftAutoSave(
    subscribe: (listener: (state: StudioState, prevState: StudioState) => void) => () => void,
) {
    subscribe((state: StudioState, prevState: StudioState) => {
        if (state.performers === prevState.performers) return

        const currentIds = new Set<string>()

        for (const performer of state.performers as PerformerNode[]) {
            currentIds.add(performer.id)

            const derivedFrom = performer.meta?.derivedFrom
            if (!derivedFrom) continue

            const hash = configHash(performer)
            const prev = _hashes.get(performer.id)

            if (prev === undefined) {
                _hashes.set(performer.id, hash)
                continue
            }
            if (hash === prev) continue

            _hashes.set(performer.id, hash)

            const existing = _timers.get(performer.id)
            if (existing) clearTimeout(existing)

            _timers.set(performer.id, setTimeout(() => {
                _timers.delete(performer.id)

                const description = performer.meta?.authoring?.description || performer.name

                const content = {
                    talRef: performer.talRef || null,
                    danceRefs: performer.danceRefs || [],
                    model: performer.model || null,
                    modelVariant: performer.modelVariant || null,
                    mcpServerNames: performer.mcpServerNames || [],
                    mcpBindingMap: performer.mcpBindingMap || {},
                    planMode: performer.planMode || false,
                    agentId: performer.agentId || null,
                }

                const draftId = `auto-${performer.id}`

                api.drafts.update('performer', draftId, {
                    name: `${performer.name} (modified)`,
                    content,
                    description,
                    derivedFrom,
                }).catch(() => {
                    api.drafts.create({
                        kind: 'performer',
                        id: draftId,
                        name: `${performer.name} (modified)`,
                        content,
                        description,
                        derivedFrom,
                    }).catch((err) => {
                        console.warn('[auto-save] Failed to save performer draft', err)
                    })
                })
            }, DEBOUNCE_MS))
        }

        // Clean up stale entries for removed performers
        for (const id of _hashes.keys()) {
            if (!currentIds.has(id)) {
                _hashes.delete(id)
                const timer = _timers.get(id)
                if (timer) {
                    clearTimeout(timer)
                    _timers.delete(id)
                }
            }
        }
    })
}
