import path from 'path'
import { getAssetPayload, readAsset } from 'dance-of-tal/lib/registry'
import { localSkillProjectionDir, toRelativePath } from './projection-manifest.js'

type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

type DraftAsset = {
    id: string
    kind: string
    name: string
    content: unknown
    description?: string
    derivedFrom?: string | null
}

export interface CompiledSkill {
    logicalName: string
    description: string
    filePath: string
    relativePath: string
    content: string
}

function sanitizeSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
}

function extractDraftTextContent(draft: DraftAsset | undefined | null): string | null {
    if (!draft) {
        return null
    }

    if (typeof draft.content === 'string') {
        return draft.content
    }

    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.content === 'string') {
            return content.content
        }
        if (typeof content.body === 'string') {
            return content.body
        }
    }

    return null
}

function extractDraftDescription(draft: DraftAsset | undefined | null): string {
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
    const [kind, author, slug] = urn.split('/')
    return {
        kind,
        author: sanitizeSegment(author.replace(/^@/, '')),
        slug: sanitizeSegment(slug),
    }
}

function buildFrontmatter(name: string, description: string) {
    return [
        '---',
        `name: ${JSON.stringify(name)}`,
        `description: ${JSON.stringify(description || 'DOT Studio generated skill')}`,
        '---',
    ].join('\n')
}

export async function compileDance(
    cwd: string,
    ref: AssetRef,
    drafts: Record<string, DraftAsset>,
    stageHash: string,
    performerId: string,
    executionDir: string,
    scope: 'stage' | 'act' = 'stage',
    actId?: string,
): Promise<CompiledSkill> {
    if (ref.kind === 'registry') {
        const asset = await readAsset(cwd, ref.urn)
        const body = await getAssetPayload(cwd, ref.urn)
        if (!body) {
            throw new Error(`Dance '${ref.urn}' was not found or has no content.`)
        }

        const parsed = parseUrn(ref.urn)
        const logicalName = [
            'dot-studio',
            'stage',
            stageHash,
            sanitizeSegment(performerId),
            parsed.author,
            parsed.slug,
        ].join('-')
        const description = typeof asset?.description === 'string' ? asset.description : parsed.slug
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
        }
    }

    const draft = drafts[ref.draftId]
    const body = extractDraftTextContent(draft)
    if (!draft || !body) {
        throw new Error(`Dance draft '${ref.draftId}' was not found or has no content.`)
    }

    const logicalName = [
        'dot-studio',
        'stage',
        stageHash,
        sanitizeSegment(performerId),
        'draft',
        sanitizeSegment(ref.draftId),
    ].join('-')
    const description = extractDraftDescription(draft) || draft.name || 'Draft dance'
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
    }
}
