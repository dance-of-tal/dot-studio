/**
 * draft-service.ts — Filesystem CRUD for `.dance-of-tal/drafts/`
 *
 * Tal / Performer / Act: .dance-of-tal/drafts/<kind>/<id>.json
 * Dance (bundle):        .dance-of-tal/drafts/dance/<id>/draft.json + SKILL.md + sibling dirs
 * Dance (legacy):        .dance-of-tal/drafts/dance/<id>.json  (lazily migrated to bundle)
 * Project-local only — no global scope.
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { getDotDir, ensureDotDir } from '../lib/dot-source.js'
import {
    danceBundleDir,
    isDanceBundleDraft,
    scaffoldDanceBundle,
    readBundleSkillContent,
    writeBundleSkillContent,
} from './dance-bundle-service.js'
import type {
    ActDraftContent,
    CreateDraftRequest,
    DraftAssetKind,
    DraftFile,
    PerformerDraftContent,
    TypedDraftFile,
    UpdateDraftRequest,
} from '../../shared/draft-contracts.js'

const DRAFT_KINDS: readonly DraftAssetKind[] = ['tal', 'dance', 'performer', 'act'] as const

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function isPerformerDraftFile(draft: DraftFile): draft is TypedDraftFile<'performer'> {
    return draft.kind === 'performer' && !!draft.content && typeof draft.content === 'object'
}

function isActDraftFile(draft: DraftFile): draft is TypedDraftFile<'act'> {
    return draft.kind === 'act' && !!draft.content && typeof draft.content === 'object'
}

function draftsDir(cwd: string): string {
    return path.join(getDotDir(cwd), 'drafts')
}

function kindDir(cwd: string, kind: DraftAssetKind): string {
    return path.join(draftsDir(cwd), kind)
}

function draftFilePath(cwd: string, kind: DraftAssetKind, id: string): string {
    return path.join(kindDir(cwd, kind), `${id}.json`)
}

function generateDraftId(): string {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(4).toString('hex')
    return `draft-${timestamp}-${random}`
}

async function ensureDraftsDir(cwd: string, kind: DraftAssetKind): Promise<void> {
    await ensureDotDir(cwd)
    await fs.mkdir(kindDir(cwd, kind), { recursive: true })
}

// ── Create ──────────────────────────────────────────────

export async function createDraft(cwd: string, input: CreateDraftRequest): Promise<DraftFile> {
    const id = input.id || generateDraftId()
    const now = Date.now()

    // Dance drafts use bundle format
    if (input.kind === 'dance') {
        const skillContent = typeof input.content === 'string' ? input.content : ''
        const draft: DraftFile = {
            id,
            kind: input.kind,
            name: input.name,
            content: skillContent,
            slug: input.slug,
            description: input.description,
            tags: input.tags || [],
            derivedFrom: input.derivedFrom || null,
            createdAt: now,
            updatedAt: now,
            formatVersion: 2,
        }

        await ensureDraftsDir(cwd, input.kind)
        await scaffoldDanceBundle(cwd, id, skillContent)

        // Write draft.json metadata (content is stored in SKILL.md, not in draft.json)
        const metaOnly = { ...draft, content: undefined }
        await fs.writeFile(
            path.join(danceBundleDir(cwd, id), 'draft.json'),
            JSON.stringify(metaOnly, null, 2),
            'utf-8',
        )

        return draft
    }

    // Tal / Performer / Act — legacy JSON single-file
    const draft: DraftFile = {
        id,
        kind: input.kind,
        name: input.name,
        content: input.content,
        slug: input.slug,
        description: input.description,
        tags: input.tags || [],
        derivedFrom: input.derivedFrom || null,
        createdAt: now,
        updatedAt: now,
        formatVersion: 1,
    }

    await ensureDraftsDir(cwd, input.kind)
    await fs.writeFile(
        draftFilePath(cwd, input.kind, id),
        JSON.stringify(draft, null, 2),
        'utf-8',
    )

    return draft
}

// ── Read ────────────────────────────────────────────────

export async function readDraft(cwd: string, kind: DraftAssetKind, id: string): Promise<DraftFile | null> {
    // Dance: try bundle format first
    if (kind === 'dance') {
        if (await isDanceBundleDraft(cwd, id)) {
            return readDanceBundleDraft(cwd, id)
        }
        // Try legacy JSON, then lazily migrate
        const legacy = await readLegacyJsonDraft(cwd, kind, id)
        if (legacy) {
            return migrateLegacyDanceDraft(cwd, legacy)
        }
        return null
    }

    // Tal / Performer / Act — legacy JSON
    return readLegacyJsonDraft(cwd, kind, id)
}

async function readLegacyJsonDraft(cwd: string, kind: DraftAssetKind, id: string): Promise<DraftFile | null> {
    try {
        const raw = await fs.readFile(draftFilePath(cwd, kind, id), 'utf-8')
        return JSON.parse(raw) as DraftFile
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return null
        throw error
    }
}

async function readDanceBundleDraft(cwd: string, id: string): Promise<DraftFile | null> {
    try {
        const metaRaw = await fs.readFile(path.join(danceBundleDir(cwd, id), 'draft.json'), 'utf-8')
        const meta = JSON.parse(metaRaw) as DraftFile
        const skillContent = await readBundleSkillContent(cwd, id)
        return {
            ...meta,
            content: skillContent || '',
            formatVersion: 2,
        }
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return null
        throw error
    }
}

/**
 * Lazily migrate a legacy Dance JSON draft to bundle format.
 * Creates the bundle directory, writes SKILL.md, writes draft.json, removes the old file.
 */
async function migrateLegacyDanceDraft(cwd: string, legacy: DraftFile): Promise<DraftFile> {
    const skillContent = typeof legacy.content === 'string' ? legacy.content : ''
    await scaffoldDanceBundle(cwd, legacy.id, skillContent)

    const migrated: DraftFile = {
        ...legacy,
        formatVersion: 2,
    }
    const metaOnly = { ...migrated, content: undefined }
    await fs.writeFile(
        path.join(danceBundleDir(cwd, legacy.id), 'draft.json'),
        JSON.stringify(metaOnly, null, 2),
        'utf-8',
    )

    // Remove legacy file (best effort)
    try {
        await fs.unlink(draftFilePath(cwd, 'dance', legacy.id))
    } catch { /* ignore if already gone */ }

    return migrated
}

/**
 * Read just the content field from a draft — used by compilers.
 * Returns the text content for tal/dance, or the full content object for performer/act.
 */
export async function readDraftContent(cwd: string, kind: DraftAssetKind, id: string): Promise<unknown | null> {
    const draft = await readDraft(cwd, kind, id)
    if (!draft) return null
    return draft.content
}

/**
 * Read the text content from a draft — convenience for tal/dance.
 * Returns null if not found or content is not a string.
 */
export async function readDraftTextContent(cwd: string, kind: DraftAssetKind, id: string): Promise<string | null> {
    const content = await readDraftContent(cwd, kind, id)
    return typeof content === 'string' ? content : null
}

// ── List ────────────────────────────────────────────────

export async function listDrafts(cwd: string, kind?: DraftAssetKind): Promise<DraftFile[]> {
    const kinds = kind ? [kind] : [...DRAFT_KINDS]
    const drafts: DraftFile[] = []
    const seenIds = new Set<string>()

    for (const k of kinds) {
        const dir = kindDir(cwd, k)
        let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>

        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ENOENT') continue
            throw error
        }

        for (const entry of entries) {
            // Dance bundle directories
            if (k === 'dance' && entry.isDirectory()) {
                try {
                    const metaPath = path.join(dir, entry.name, 'draft.json')
                    const raw = await fs.readFile(metaPath, 'utf-8')
                    const meta = JSON.parse(raw) as DraftFile
                    const skillContent = await readBundleSkillContent(cwd, entry.name)
                    drafts.push({
                        ...meta,
                        content: skillContent || '',
                        formatVersion: 2,
                    })
                    seenIds.add(meta.id)
                } catch {
                    // Skip malformed bundle
                }
                continue
            }

            // Legacy JSON files
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue

            try {
                const raw = await fs.readFile(path.join(dir, entry.name), 'utf-8')
                const draft = JSON.parse(raw) as DraftFile
                // Skip if already seen as a bundle draft (shouldn't happen, but safety)
                if (seenIds.has(draft.id)) continue
                drafts.push(draft)
            } catch {
                // Skip malformed files
            }
        }
    }

    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
}

// ── Update ──────────────────────────────────────────────

export async function updateDraft(
    cwd: string,
    kind: DraftAssetKind,
    id: string,
    patch: UpdateDraftRequest,
): Promise<DraftFile | null> {
    const existing = await readDraft(cwd, kind, id)
    if (!existing) return null

    const updated: DraftFile = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.derivedFrom !== undefined ? { derivedFrom: patch.derivedFrom } : {}),
        updatedAt: Date.now(),
    }

    // Dance bundle: write SKILL.md content + metadata to draft.json
    if (kind === 'dance' && (existing.formatVersion === 2 || await isDanceBundleDraft(cwd, id))) {
        updated.formatVersion = 2
        // Write SKILL.md if content was patched
        if (patch.content !== undefined && typeof patch.content === 'string') {
            await writeBundleSkillContent(cwd, id, patch.content)
        }
        // Write metadata to draft.json (content excluded from metadata file)
        const metaOnly = { ...updated, content: undefined }
        await fs.writeFile(
            path.join(danceBundleDir(cwd, id), 'draft.json'),
            JSON.stringify(metaOnly, null, 2),
            'utf-8',
        )
        return updated
    }

    // Legacy JSON
    await fs.writeFile(
        draftFilePath(cwd, kind, id),
        JSON.stringify(updated, null, 2),
        'utf-8',
    )

    return updated
}

// ── Delete & Cascade ────────────────────────────────────

export type DraftUninstallPlanItem = {
    draftId: string
    kind: DraftAssetKind
    name: string
    source: 'draft'
    reason: string
}

export type DraftUninstallPlan = {
    target: DraftUninstallPlanItem
    dependents: DraftUninstallPlanItem[]
}

function extractReferencedDrafts(draft: DraftFile): Array<{ kind: string; draftId: string }> {
    const refs: Array<{ kind: string; draftId: string }> = []

    if (isPerformerDraftFile(draft)) {
        const content: PerformerDraftContent = draft.content
        if (content.talRef?.kind === 'draft' && typeof content.talRef.draftId === 'string') {
            refs.push({ kind: 'tal', draftId: content.talRef.draftId })
        }
        if (Array.isArray(content.danceRefs)) {
            for (const ref of content.danceRefs) {
                if (ref?.kind === 'draft' && typeof ref.draftId === 'string') {
                    refs.push({ kind: 'dance', draftId: ref.draftId })
                }
            }
        }
    }

    if (isActDraftFile(draft)) {
        const content: ActDraftContent = draft.content
        for (const key of Object.keys(content.participants)) {
            const participant = content.participants[key]
            if (participant?.performerRef?.kind === 'draft' && typeof participant.performerRef.draftId === 'string') {
                refs.push({ kind: 'performer', draftId: participant.performerRef.draftId })
            }
        }
    }

    return refs
}

export async function findDraftDependents(cwd: string, targetKind: DraftAssetKind, targetId: string): Promise<DraftUninstallPlan> {
    const allDrafts = await listDrafts(cwd)
    const targetDraft = allDrafts.find((d) => d.kind === targetKind && d.id === targetId)

    if (!targetDraft) {
        throw new Error(`Draft not found: ${targetKind}/${targetId}`)
    }

    const dependents: DraftUninstallPlanItem[] = []
    const processedIds = new Set<string>([targetId])

    const queue = [targetId]
    while (queue.length > 0) {
        const currentId = queue.shift()!
        for (const draft of allDrafts) {
            if (processedIds.has(draft.id)) continue

            const refs = extractReferencedDrafts(draft)
            if (refs.some((r) => r.draftId === currentId)) {
                processedIds.add(draft.id)
                const reason = draft.kind === 'performer'
                    ? `References ${targetKind} draft`
                    : `Contains performer referencing ${targetKind} draft`
                dependents.push({
                    draftId: draft.id,
                    kind: draft.kind,
                    name: draft.name,
                    source: 'draft',
                    reason,
                })
                queue.push(draft.id)
            }
        }
    }

    return {
        target: {
            draftId: targetDraft.id,
            kind: targetDraft.kind,
            name: targetDraft.name,
            source: 'draft',
            reason: 'Target',
        },
        dependents,
    }
}

async function deleteSingleDraft(cwd: string, kind: DraftAssetKind, id: string): Promise<boolean> {
    // Dance: try bundle first
    if (kind === 'dance' && await isDanceBundleDraft(cwd, id)) {
        await fs.rm(danceBundleDir(cwd, id), { recursive: true, force: true })
        return true
    }

    // Legacy JSON
    try {
        await fs.unlink(draftFilePath(cwd, kind, id))
        return true
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return false
        throw error
    }
}

export async function deleteDraft(cwd: string, kind: DraftAssetKind, id: string, cascade = false): Promise<{ ok: boolean; deletedIds: string[] }> {
    const deletedIds: string[] = []

    if (cascade) {
        const plan = await findDraftDependents(cwd, kind, id)
        // Delete dependents first (bottom-up: acts before performers)
        const sortedDependents = [...plan.dependents].sort((a, b) => {
            const order: Record<string, number> = { act: 0, performer: 1, dance: 2, tal: 3 }
            return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
        })

        for (const dep of sortedDependents) {
            try {
                const deleted = await deleteSingleDraft(cwd, dep.kind, dep.draftId)
                if (deleted) deletedIds.push(dep.draftId)
            } catch (error: unknown) {
                if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
            }
        }
    }

    const deleted = await deleteSingleDraft(cwd, kind, id)
    if (deleted) {
        deletedIds.push(id)
        return { ok: true, deletedIds }
    }
    return { ok: false, deletedIds }
}
