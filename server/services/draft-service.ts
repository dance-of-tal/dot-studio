/**
 * draft-service.ts — Filesystem CRUD for `.dance-of-tal/drafts/`
 *
 * Draft files live at: .dance-of-tal/drafts/<kind>/<id>.json
 * Project-local only — no global scope.
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { getDotDir, ensureDotDir } from 'dance-of-tal/lib/registry'
import type { DraftFile, DraftAssetKind, CreateDraftRequest, UpdateDraftRequest } from '../../shared/draft-contracts.js'

const DRAFT_KINDS: readonly DraftAssetKind[] = ['tal', 'dance', 'performer', 'act'] as const

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
    try {
        const raw = await fs.readFile(draftFilePath(cwd, kind, id), 'utf-8')
        return JSON.parse(raw) as DraftFile
    } catch (err: any) {
        if (err.code === 'ENOENT') return null
        throw err
    }
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

    for (const k of kinds) {
        const dir = kindDir(cwd, k)
        let entries: Array<{ name: string; isFile: () => boolean }>

        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (err: any) {
            if (err.code === 'ENOENT') continue
            throw err
        }

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue

            try {
                const raw = await fs.readFile(path.join(dir, entry.name), 'utf-8')
                const draft = JSON.parse(raw) as DraftFile
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

    await fs.writeFile(
        draftFilePath(cwd, kind, id),
        JSON.stringify(updated, null, 2),
        'utf-8',
    )

    return updated
}

// ── Delete ──────────────────────────────────────────────

export async function deleteDraft(cwd: string, kind: DraftAssetKind, id: string): Promise<boolean> {
    try {
        await fs.unlink(draftFilePath(cwd, kind, id))
        return true
    } catch (err: any) {
        if (err.code === 'ENOENT') return false
        throw err
    }
}
