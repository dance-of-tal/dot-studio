import path from 'path'
import { createHash } from 'crypto'
import { getAssetPayload } from 'dance-of-tal/lib/registry'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { findRuntimeModelVariant } from '../../../shared/model-variants.js'
import { agentProjectionDir, toRelativePath } from './projection-manifest.js'
import type { CompiledSkill } from './dance-compiler.js'

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
    performerName: string
    talRef: AssetRef | null
    drafts: Record<string, DraftAsset>
    model: ModelSelection
    modelVariant?: string | null
    stageHash: string
    executionDir: string
    scope?: 'stage' | 'act'
    actId?: string
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    relationPromptSection?: string | null
}

type AgentFile = {
    agentName: string
    filePath: string
    relativePath: string
    content: string
}

export interface CompiledPerformer {
    performerId: string
    agentNames: Record<Posture, string>
    agentPaths: Record<Posture, string>
    agentContents: Record<Posture, string>
    skills: CompiledSkill[]
    projectionHash: string
    allFiles: string[]
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

    return extractDraftTextContent(drafts[ref.draftId])
}

function buildSystemPreamble() {
    return [
        '# Runtime Instructions',
        'The section named Core Instructions is the always-on instruction layer for your role, rules, and operating logic.',
        'Use only the minimum context and tools needed to complete the task well.',
        'Do not mention internal runtime wiring unless the user asks about it directly.',
    ].join('\n')
}

function buildTalSection(talContent: string | null) {
    if (!talContent) {
        return [
            '# Core Instructions',
            'No core instruction asset is configured. Follow the user request directly and stay consistent with the current session context.',
        ].join('\n')
    }

    return [
        '# Core Instructions',
        '',
        talContent,
    ].join('\n')
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

function buildBody(input: {
    talContent: string | null
    variantId: string | null
    variantSummary: string | null
    relationPromptSection?: string | null
}) {
    return [
        buildSystemPreamble(),
        buildTalSection(input.talContent),
        buildRuntimePreferencesSection(input.variantId, input.variantSummary),
        input.relationPromptSection || null,
    ].filter(Boolean).join('\n\n')
}

function agentName(stageHash: string, performerId: string, posture: Posture, scope: 'stage' | 'act', actId?: string) {
    if (scope === 'act' && actId) {
        return `dot-studio/act/${stageHash}/${actId}/${performerId}--${posture}`
    }
    return `dot-studio/${stageHash}/${performerId}--${posture}`
}

function buildSkillPermissionLines(skillNames: string[]) {
    const lines = ['permission:', '  skill:', '    "*": "deny"']
    for (const skillName of skillNames) {
        lines.push(`    ${JSON.stringify(skillName)}: "allow"`)
    }
    return lines
}

function buildTaskPermissionLines(taskAllowlist: string[]) {
    if (taskAllowlist.length === 0) {
        return []
    }
    const lines = ['  task:', '    "*": "deny"']
    for (const agentName of taskAllowlist) {
        lines.push(`    ${JSON.stringify(agentName)}: "allow"`)
    }
    return lines
}

function buildToolsLines(toolMap: Record<string, boolean>, posture: Posture) {
    const pairs = Object.entries(toolMap).sort(([left], [right]) => left.localeCompare(right))
    if (posture === 'plan') {
        pairs.push(['bash', false], ['edit', false], ['write', false])
    }
    if (pairs.length === 0) {
        return []
    }

    const lines = ['tools:']
    for (const [tool, enabled] of pairs) {
        lines.push(`  ${JSON.stringify(tool)}: ${enabled ? 'true' : 'false'}`)
    }
    return lines
}

function buildFrontmatter(input: {
    performerName: string
    model: ModelSelection
    posture: Posture
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
}) {
    const lines = ['---']
    lines.push(`description: ${JSON.stringify(`DOT Studio performer: ${input.performerName}`)}`)
    lines.push('mode: primary')
    if (input.model) {
        lines.push(`model: ${JSON.stringify(`${input.model.provider}/${input.model.modelId}`)}`)
    }
    lines.push(...buildSkillPermissionLines(input.skillNames))
    lines.push(...buildTaskPermissionLines(input.taskAllowlist || []))
    lines.push(...buildToolsLines(input.toolMap, input.posture))
    lines.push('---')
    return lines.join('\n')
}

function buildAgentFile(input: {
    stageHash: string
    performerId: string
    performerName: string
    executionDir: string
    scope: 'stage' | 'act'
    actId?: string
    model: ModelSelection
    posture: Posture
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    body: string
}): AgentFile {
    const fileName = `${input.performerId}--${input.posture}.md`
    const filePath = path.join(agentProjectionDir(input.executionDir, input.stageHash, input.scope, input.actId), fileName)
    const frontmatter = buildFrontmatter({
        performerName: input.performerName,
        model: input.model,
        posture: input.posture,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
    })
    const content = `${frontmatter}\n\n${input.body}`
    return {
        agentName: agentName(input.stageHash, input.performerId, input.posture, input.scope, input.actId),
        filePath,
        relativePath: toRelativePath(input.executionDir, filePath),
        content,
    }
}

export async function compilePerformer(
    cwd: string,
    input: PerformerCompileInput,
    skills: CompiledSkill[],
): Promise<CompiledPerformer> {
    const talContent = await resolveTalContent(cwd, input.talRef, input.drafts)

    let resolvedVariantId: string | null = null
    let variantSummary: string | null = null
    if (input.model) {
        const runtimeModel = await resolveRuntimeModel(cwd, input.model)
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

    const body = buildBody({
        talContent,
        variantId: resolvedVariantId,
        variantSummary,
        relationPromptSection: input.relationPromptSection || null,
    })

    const buildFile = buildAgentFile({
        stageHash: input.stageHash,
        performerId: input.performerId,
        performerName: input.performerName,
        executionDir: input.executionDir,
        scope: input.scope || 'stage',
        actId: input.actId,
        model: input.model,
        posture: 'build',
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
        body,
    })

    const planFile = buildAgentFile({
        stageHash: input.stageHash,
        performerId: input.performerId,
        performerName: input.performerName,
        executionDir: input.executionDir,
        scope: input.scope || 'stage',
        actId: input.actId,
        model: input.model,
        posture: 'plan',
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
        body,
    })

    const hashInput = [
        buildFile.content,
        planFile.content,
        ...skills.map((skill) => skill.content),
    ].join('\n\n')
    const projectionHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16)

    return {
        performerId: input.performerId,
        agentNames: {
            build: buildFile.agentName,
            plan: planFile.agentName,
        },
        agentPaths: {
            build: buildFile.filePath,
            plan: planFile.filePath,
        },
        agentContents: {
            build: buildFile.content,
            plan: planFile.content,
        },
        skills,
        projectionHash,
        allFiles: [
            buildFile.relativePath,
            planFile.relativePath,
            ...skills.map((skill) => skill.relativePath),
        ],
    }
}
