import fs from 'fs/promises'
import path from 'path'
import { parseDanceFromSkillMd } from 'dance-of-tal/contracts'
import { readDraft } from './draft-service.js'
import { danceBundleDir } from './dance-bundle-service.js'

export const DANCE_EXPORT_EXISTS_PREFIX = 'Export destination already exists: '

function sanitizeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function buildFrontmatter(input: {
    name: string
    description: string
    license?: string
    compatibility?: string
    metadata?: Record<string, unknown>
    allowedTools?: string
}) {
    return [
        '---',
        `name: ${JSON.stringify(input.name)}`,
        `description: ${JSON.stringify(input.description || 'Generated skill')}`,
        ...(input.license ? [`license: ${JSON.stringify(input.license)}`] : []),
        ...(input.compatibility ? [`compatibility: ${JSON.stringify(input.compatibility)}`] : []),
        ...(input.metadata ? [`metadata: ${JSON.stringify(input.metadata)}`] : []),
        ...(input.allowedTools ? [`allowed-tools: ${JSON.stringify(input.allowedTools)}`] : []),
        '---',
    ].join('\n')
}

function normalizeSkillMarkdown(raw: string, slug: string, descriptionFallback: string) {
    const parsed = parseDanceFromSkillMd(raw)
    return `${buildFrontmatter({
        name: slug,
        description: descriptionFallback || parsed.description || slug,
        license: parsed.license,
        compatibility: parsed.compatibility,
        metadata: parsed.metadata as Record<string, unknown> | undefined,
        allowedTools: parsed.allowedTools,
    })}\n\n${parsed.content.trim()}`
}

export async function exportDanceBundle(options: {
    cwd: string
    draftId: string
    slugInput: string
    destinationParentPath: string
    overwrite?: boolean
}) {
    const slug = sanitizeSlug(options.slugInput)
    if (!slug) {
        throw new Error('Dance slug is required.')
    }

    const destinationParentInput = options.destinationParentPath.trim()
    if (!destinationParentInput) {
        throw new Error('Export destination is required.')
    }
    const destinationParentPath = path.resolve(destinationParentInput)

    const draft = await readDraft(options.cwd, 'dance', options.draftId)
    if (!draft) {
        throw new Error(`Dance draft '${options.draftId}' was not found.`)
    }

    let destinationStat: Awaited<ReturnType<typeof fs.stat>>
    try {
        destinationStat = await fs.stat(destinationParentPath)
    } catch {
        throw new Error(`Export destination not found: ${destinationParentPath}`)
    }

    if (!destinationStat.isDirectory()) {
        throw new Error(`Export destination is not a directory: ${destinationParentPath}`)
    }

    const exportPath = path.join(destinationParentPath, slug)
    const exportExists = await fs.access(exportPath).then(() => true).catch(() => false)
    if (exportExists && !options.overwrite) {
        throw new Error(`${DANCE_EXPORT_EXISTS_PREFIX}${exportPath}`)
    }

    const bundleRoot = danceBundleDir(options.cwd, options.draftId)
    if (exportExists) {
        await fs.rm(exportPath, { recursive: true, force: true })
    }
    await fs.mkdir(exportPath, { recursive: true })

    const normalizedSkill = normalizeSkillMarkdown(
        typeof draft.content === 'string' ? draft.content : '',
        slug,
        String(draft.description || draft.name || slug).trim(),
    )
    await fs.writeFile(path.join(exportPath, 'SKILL.md'), normalizedSkill, 'utf-8')

    const entries = await fs.readdir(bundleRoot, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.name === 'draft.json' || entry.name === 'SKILL.md') continue
        await fs.cp(
            path.join(bundleRoot, entry.name),
            path.join(exportPath, entry.name),
            { recursive: true, force: true },
        )
    }

    return {
        ok: true,
        draftId: draft.id,
        slug,
        exportPath,
        exportRelativeName: slug,
    }
}
