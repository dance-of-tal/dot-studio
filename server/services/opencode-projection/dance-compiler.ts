import fs from 'fs/promises'
import path from 'path'
import { getAssetPayload, readAsset } from 'dance-of-tal/lib/registry'
import { skillProjectionDir } from './projection-manifest.js'

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
    /** Skill logical name, e.g. dot-studio-local-abc123-acme-review-standard */
    logicalName: string
    /** Absolute path to generated SKILL.md */
    filePath: string
}


function slugifyUrn(urn: string): string {
    // tal/@acme/senior-engineer → acme-senior-engineer
    return urn
        .replace(/^(tal|dance|performer|act)\//, '')
        .replace(/@/g, '')
        .replace(/[/_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function buildSkillLogicalName(scope: 'global' | 'local' | 'draft', stageHash: string, slug: string): string {
    const name = `dot-studio-${scope}-${stageHash}-${slug}`
    if (name.length > 64) {
        return name.slice(0, 64)
    }
    return name
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

function buildSkillMarkdown(name: string, description: string, body: string): string {
    const lines = [
        '---',
        `name: ${name}`,
        `description: ${description || 'No description provided.'}`,
        '---',
        '',
        body,
    ]
    return lines.join('\n')
}

export async function compileDance(
    cwd: string,
    ref: AssetRef,
    drafts: Record<string, DraftAsset>,
    stageHash: string,
    workingDir: string,
): Promise<CompiledSkill> {
    if (ref.kind === 'registry') {
        const asset = await readAsset(cwd, ref.urn)
        const body = await getAssetPayload(cwd, ref.urn)
        if (!body) {
            throw new Error(`Dance asset '${ref.urn}' was not found or has no content.`)
        }

        const slug = slugifyUrn(ref.urn)
        const scope = 'local' as const
        const logicalName = buildSkillLogicalName(scope, stageHash, slug)
        const description = typeof asset?.description === 'string' ? asset.description : ''

        const dir = path.join(skillProjectionDir(workingDir, scope, stageHash), slug)
        await fs.mkdir(dir, { recursive: true })
        const filePath = path.join(dir, 'SKILL.md')
        await fs.writeFile(filePath, buildSkillMarkdown(logicalName, description, body), 'utf-8')

        return { logicalName, filePath }
    }

    // Draft dance
    const draft = drafts[ref.draftId]
    const body = extractDraftTextContent(draft)
    if (!draft || !body) {
        throw new Error(`Dance draft '${ref.draftId}' was not found or has no content.`)
    }

    const slug = `draft-${ref.draftId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const scope = 'local' as const
    const logicalName = buildSkillLogicalName(scope, stageHash, slug)
    const description = extractDraftDescription(draft) || draft.name || 'Draft capability'

    const dir = path.join(skillProjectionDir(workingDir, scope, stageHash), slug)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, 'SKILL.md')
    await fs.writeFile(filePath, buildSkillMarkdown(logicalName, description, body), 'utf-8')

    return { logicalName, filePath }
}
