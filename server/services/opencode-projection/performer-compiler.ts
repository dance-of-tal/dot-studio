import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { getAssetPayload } from 'dance-of-tal/lib/registry'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { findRuntimeModelVariant } from '../../../shared/model-variants.js'
import { compileDance, type CompiledSkill } from './dance-compiler.js'
import { agentProjectionDir, toRelativePath } from './projection-manifest.js'

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

type ModelSelection = {
    provider: string
    modelId: string
} | null

export type Posture = 'build' | 'plan'

export interface PerformerCompileInput {
    performerId: string
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    drafts: Record<string, DraftAsset>
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    description?: string
    /** cwd may differ from workingDir in safe mode */
    cwd: string
    workingDir: string
    stageHash: string
}

export interface CompiledPerformer {
    performerId: string
    agentNames: Record<Posture, string>
    agentPaths: Record<Posture, string>
    skills: CompiledSkill[]
    projectionHash: string
    allFiles: string[]
}

// ── Tal Resolution ─────────────────────────────────────

async function resolveTalContent(
    cwd: string,
    ref: AssetRef | null,
    drafts: Record<string, DraftAsset>,
): Promise<string | null> {
    if (!ref) {
        return null
    }
    if (ref.kind === 'registry') {
        return getAssetPayload(cwd, ref.urn)
    }
    const draft = drafts[ref.draftId]
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

// ── Prompt Body Builder ────────────────────────────────

function buildAgentFrontmatter(input: {
    description: string
    model: ModelSelection
    posture: Posture
}): string {
    const lines = ['---']
    lines.push(`description: ${input.description || 'DOT Studio performer'}`)

    if (input.model) {
        lines.push(`model: ${input.model.provider}/${input.model.modelId}`)
    }

    if (input.posture === 'plan') {
        lines.push('tools:')
        lines.push('  write: false')
        lines.push('  edit: false')
        lines.push('  bash: false')
    }

    lines.push('---')
    return lines.join('\n')
}

function buildSystemPreamble(): string {
    return [
        '# Runtime Instructions',
        'The section named Core Instructions is the always-on instruction layer for your role, rules, and operating logic.',
        'Do not mention internal runtime wiring, capability loading, or system sections unless the user asks about them directly.',
    ].join('\n')
}

function buildTalSection(talContent: string | null): string {
    if (!talContent) {
        return [
            '# Core Instructions',
            'No core instruction asset is configured. Follow the user request directly and stay consistent with the current session context.',
        ].join('\n')
    }
    return ['# Core Instructions', '', talContent].join('\n')
}

function buildRuntimePreferencesSection(variantId: string | null, variantSummary: string | null): string | null {
    if (!variantId) {
        return null
    }
    const lines = [
        '# Runtime Preferences',
        `Preferred model variant: ${variantId}`,
    ]
    if (variantSummary) {
        lines.push(`Variant settings: ${variantSummary}`)
    }
    lines.push('Apply this preferred runtime profile when supported by the current host and model.')
    return lines.join('\n')
}

function buildAgentBody(input: {
    talContent: string | null
    variantId: string | null
    variantSummary: string | null
}): string {
    const sections = [
        buildSystemPreamble(),
        buildTalSection(input.talContent),
        buildRuntimePreferencesSection(input.variantId, input.variantSummary),
    ]
    return sections.filter(Boolean).join('\n\n')
}

// ── Projection Hash ────────────────────────────────────

function computeProjectionHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

// ── Agent Name ─────────────────────────────────────────

export function agentName(stageHash: string, performerId: string, posture: Posture): string {
    return `dot-studio/stage/${stageHash}/${performerId}--${posture}`
}

// ── Main Compiler ──────────────────────────────────────

export async function compilePerformer(input: PerformerCompileInput): Promise<CompiledPerformer> {
    const talContent = await resolveTalContent(input.cwd, input.talRef, input.drafts)

    // Resolve model variant
    let resolvedVariantId: string | null = null
    let variantSummary: string | null = null
    if (input.model) {
        const runtimeModel = await resolveRuntimeModel(input.cwd, input.model)
        if (runtimeModel) {
            const selectedVariant = findRuntimeModelVariant(
                [runtimeModel],
                input.model.provider,
                input.model.modelId,
                input.modelVariant || null,
            )
            resolvedVariantId = selectedVariant?.id || null
            variantSummary = selectedVariant?.summary || null
        } else {
            resolvedVariantId = input.modelVariant || null
        }
    }

    const body = buildAgentBody({
        talContent,
        variantId: resolvedVariantId,
        variantSummary,
    })

    // Compile Dance → Skills
    const skills: CompiledSkill[] = []
    for (const ref of input.danceRefs) {
        const skill = await compileDance(input.cwd, ref, input.drafts, input.stageHash, input.workingDir)
        skills.push(skill)
    }

    // Generate posture-specific agent files
    const dir = agentProjectionDir(input.workingDir, 'stage', input.stageHash)
    await fs.mkdir(dir, { recursive: true })

    const postures: Posture[] = ['build', 'plan']
    const agentNames: Record<string, string> = {}
    const agentPaths: Record<string, string> = {}
    const allFiles: string[] = []
    let hashInput = ''

    for (const posture of postures) {
        const frontmatter = buildAgentFrontmatter({
            description: input.description || 'DOT Studio performer',
            model: input.model,
            posture,
        })
        const fullContent = frontmatter + '\n\n' + body
        hashInput += fullContent

        const fileName = `${input.performerId}--${posture}.md`
        const filePath = path.join(dir, fileName)
        await fs.writeFile(filePath, fullContent, 'utf-8')

        agentNames[posture] = agentName(input.stageHash, input.performerId, posture)
        agentPaths[posture] = filePath
        allFiles.push(toRelativePath(input.workingDir, filePath))
    }

    // Add skill files to allFiles
    for (const skill of skills) {
        allFiles.push(toRelativePath(input.workingDir, skill.filePath))
    }

    const projectionHash = computeProjectionHash(hashInput)

    return {
        performerId: input.performerId,
        agentNames: agentNames as Record<Posture, string>,
        agentPaths: agentPaths as Record<Posture, string>,
        skills,
        projectionHash,
        allFiles,
    }
}
