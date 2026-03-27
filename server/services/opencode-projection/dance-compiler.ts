import path from 'path'
import fs from 'fs/promises'
import { getAssetPayload, readAsset, danceAssetDir } from '../../lib/dot-source.js'
import { localSkillProjectionDir, toRelativePath } from './projection-manifest.js'
import { readDraft } from '../draft-service.js'
import {
    isDanceBundleDraft,
    danceBundleDir,
    readBundleSkillContent,
} from '../dance-bundle-service.js'

type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }



export interface CompiledSkill {
    logicalName: string
    description: string
    filePath: string
    relativePath: string
    content: string
    /** Additional files projected from bundle (absolute paths) */
    additionalFiles: string[]
}

function sanitizeSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
}



function extractDraftDescription(draft: { description?: string; content?: unknown } | undefined | null): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.description === 'string') {
        return draft.description
    }
    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.description === 'string') {
            return content.description
        }
    }
    return ''
}

function parseUrn(urn: string) {
    // URN is 4-segment: kind/@owner/stage/name
    const parts = urn.split('/')
    const kind = parts[0] ?? ''
    const ownerWithAt = parts[1] ?? ''
    const stage = parts[2] ?? ''
    const name = parts[3] ?? ''
    return {
        kind,
        author: sanitizeSegment(ownerWithAt.replace(/^@/, '')),
        stage: sanitizeSegment(stage),
        slug: sanitizeSegment(name),
    }
}

function buildFrontmatter(name: string, description: string) {
    return [
        '---',
        `name: ${JSON.stringify(name)}`,
        `description: ${JSON.stringify(description || 'Generated skill')}`,
        '---',
    ].join('\n')
}

export async function compileDance(
    cwd: string,
    ref: AssetRef,
    stageHash: string,
    performerId: string,
    executionDir: string,
    scope: 'workspace' | 'act' = 'workspace',
    actId?: string,
): Promise<CompiledSkill> {
    if (ref.kind === 'registry') {
        const asset = await readAsset(cwd, ref.urn)
        const body = await getAssetPayload(cwd, ref.urn)
        if (!body) {
            throw new Error(`Dance '${ref.urn}' was not found or has no content.`)
        }

        const parsed = parseUrn(ref.urn)
        const logicalName = parsed.slug
        const description = typeof asset?.description === 'string' ? asset.description : parsed.slug
        const skillDir = path.join(
            localSkillProjectionDir(executionDir, stageHash, performerId, scope, actId),
            logicalName,
        )
        const filePath = path.join(skillDir, 'SKILL.md')
        const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

        // Copy bundle sibling dirs (scripts/, references/, assets/) from locally installed dance
        const bundleDir = danceAssetDir(cwd, ref.urn)
        const additionalFiles = await copyBundleSiblings(bundleDir, skillDir)

        return {
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(executionDir, filePath),
            content,
            additionalFiles,
        }
    }

    // ── Draft ref: check if bundle-backed ─────────────────
    const isBundle = await isDanceBundleDraft(cwd, ref.draftId)

    if (isBundle) {
        const body = await readBundleSkillContent(cwd, ref.draftId)
        if (!body) {
            throw new Error(`Dance draft '${ref.draftId}' is missing SKILL.md.`)
        }

        const draft = await readDraft(cwd, 'dance', ref.draftId)
        const logicalName = sanitizeSegment(draft?.name || ref.draftId)
        const description = extractDraftDescription(draft) || draft?.name || 'Draft skill'
        const skillDir = path.join(
            localSkillProjectionDir(executionDir, stageHash, performerId, scope, actId),
            logicalName,
        )
        const filePath = path.join(skillDir, 'SKILL.md')
        const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

        // Copy bundle sibling directories into projection
        const bundleRoot = danceBundleDir(cwd, ref.draftId)
        const additionalFiles = await copyBundleSiblings(bundleRoot, skillDir)

        return {
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(executionDir, filePath),
            content,
            additionalFiles,
        }
    }

    const draft = await readDraft(cwd, 'dance', ref.draftId)
    const body = draft ? (typeof draft.content === 'string' ? draft.content : null) : null
    if (!draft || !body) {
        throw new Error(`Dance draft '${ref.draftId}' was not found or has no content.`)
    }

    const logicalName = sanitizeSegment(draft.name || ref.draftId)
    const description = extractDraftDescription(draft) || draft.name || 'Draft skill'
    const filePath = path.join(
        localSkillProjectionDir(executionDir, stageHash, performerId, scope, actId),
        logicalName,
        'SKILL.md',
    )
    const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

    return {
        logicalName,
        description,
        filePath,
        relativePath: toRelativePath(executionDir, filePath),
        content,
        additionalFiles: [],
    }
}

/**
 * Copy all bundle contents (except SKILL.md itself) from the source bundle directory
 * into the target projection directory. SKILL.md is handled separately via writeIfChanged.
 * Returns absolute paths of all copied files.
 */
async function copyBundleSiblings(bundleRoot: string, targetDir: string): Promise<string[]> {
    const copiedFiles: string[] = []

    let entries: import('fs').Dirent[]
    try {
        entries = await fs.readdir(bundleRoot, { withFileTypes: true, encoding: 'utf-8' })
    } catch {
        return copiedFiles // bundle dir doesn't exist (e.g. SKILL.md-only install)
    }

    for (const entry of entries) {
        if (entry.name === 'SKILL.md') continue // handled via writeIfChanged
        const srcPath = path.join(bundleRoot, entry.name)
        const destPath = path.join(targetDir, entry.name)

        if (entry.isDirectory()) {
            await copyDirRecursive(srcPath, destPath, copiedFiles)
        } else if (entry.isFile()) {
            await fs.mkdir(path.dirname(destPath), { recursive: true })
            await fs.copyFile(srcPath, destPath)
            copiedFiles.push(destPath)
        }
    }

    return copiedFiles
}

async function copyDirRecursive(src: string, dest: string, copiedFiles: string[]): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    const entries = await fs.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
            await copyDirRecursive(srcPath, destPath, copiedFiles)
        } else if (entry.isFile()) {
            await fs.copyFile(srcPath, destPath)
            copiedFiles.push(destPath)
        }
    }
}
