
import { createHash } from 'crypto'
import { getAssetPayload } from 'dance-of-tal/lib/registry'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { findRuntimeModelVariant } from '../../../shared/model-variants.js'
import { toRelativePath, resolveAgentIdentity } from './projection-manifest.js'
import type { Posture } from './projection-manifest.js'
export type { Posture } from './projection-manifest.js'
import type { CompiledSkill } from './dance-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { readDraftTextContent } from '../draft-service.js'

type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }



export interface PerformerCompileInput {
    performerId: string
    performerName: string
    talRef: AssetRef | null
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
    agentNames: Partial<Record<Posture, string>>
    agentPaths: Partial<Record<Posture, string>>
    agentContents: Partial<Record<Posture, string>>
    skills: CompiledSkill[]
    projectionHash: string
    allFiles: string[]
}




async function resolveTalContent(
    cwd: string,
    ref: AssetRef | null,
): Promise<string | null> {
    if (!ref) {
        return null
    }

    if (ref.kind === 'registry') {
        return getAssetPayload(cwd, ref.urn)
    }

    return readDraftTextContent(cwd, 'tal', ref.draftId)
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



function buildBody(input: {
    talContent: string | null
    relationPromptSection?: string | null
}) {
    return [
        buildTalSection(input.talContent),
        input.relationPromptSection || null,
    ].filter(Boolean).join('\n\n')
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
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
}) {
    const lines = ['---']
    lines.push(`description: ${JSON.stringify(`Agent: ${input.performerName}`)}`)
    lines.push('mode: primary')
    if (input.model) {
        lines.push(`model: ${JSON.stringify(`${input.model.provider}/${input.model.modelId}`)}`)
    }
    if (input.variantId) {
        lines.push(`variant: ${JSON.stringify(input.variantId)}`)
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
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    body: string
}): AgentFile {
    const identity = resolveAgentIdentity({
        executionDir: input.executionDir,
        stageHash: input.stageHash,
        performerId: input.performerId,
        posture: input.posture,
        scope: input.scope,
        actId: input.actId,
    })
    const frontmatter = buildFrontmatter({
        performerName: input.performerName,
        model: input.model,
        posture: input.posture,
        variantId: input.variantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
    })
    const content = `${frontmatter}\n\n${input.body}`
    return {
        agentName: identity.agentName,
        filePath: identity.filePath,
        relativePath: toRelativePath(input.executionDir, identity.filePath),
        content,
    }
}

export async function compilePerformer(
    cwd: string,
    input: PerformerCompileInput,
    skills: CompiledSkill[],
): Promise<CompiledPerformer> {
    const talContent = await resolveTalContent(cwd, input.talRef)

    let resolvedVariantId: string | null = null
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
        } else {
            resolvedVariantId = input.modelVariant || null
        }
    }

    const body = buildBody({
        talContent,
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
        variantId: resolvedVariantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
        body,
    })

    // Act scope: build-only (no plan agent — complex multi-performer Acts
    // make plan mode impractical to control across the whole graph).
    const includePlan = (input.scope || 'stage') !== 'act'
    const planFile = includePlan
        ? buildAgentFile({
            stageHash: input.stageHash,
            performerId: input.performerId,
            performerName: input.performerName,
            executionDir: input.executionDir,
            scope: input.scope || 'stage',
            actId: input.actId,
            model: input.model,
            posture: 'plan',
            variantId: resolvedVariantId,
            skillNames: input.skillNames,
            toolMap: input.toolMap,
            taskAllowlist: input.taskAllowlist,
            body,
        })
        : null

    const hashInput = [
        buildFile.content,
        planFile?.content,
        ...skills.map((skill) => skill.content),
    ].filter(Boolean).join('\n\n')
    const projectionHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16)

    const allFiles = [
        buildFile.relativePath,
        ...(planFile ? [planFile.relativePath] : []),
        ...skills.map((skill) => skill.relativePath),
    ]

    return {
        performerId: input.performerId,
        agentNames: {
            build: buildFile.agentName,
            ...(planFile ? { plan: planFile.agentName } : {}),
        },
        agentPaths: {
            build: buildFile.filePath,
            ...(planFile ? { plan: planFile.filePath } : {}),
        },
        agentContents: {
            build: buildFile.content,
            ...(planFile ? { plan: planFile.content } : {}),
        },
        skills,
        projectionHash,
        allFiles,
    }
}
