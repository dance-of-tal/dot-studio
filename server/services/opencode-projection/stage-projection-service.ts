import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getOpencode } from '../../lib/opencode.js'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { resolveRuntimeTools, type RuntimeToolResolution } from '../../lib/runtime-tools.js'
import {
    cleanGroupFiles,
    updateGitExclude,
    updateManifestGroup,
    resolveAgentIdentity,
} from './projection-manifest.js'
import { compileDance, type CompiledSkill } from './dance-compiler.js'
import { compilePerformer, type CompiledPerformer, type PerformerCompileInput, type Posture } from './performer-compiler.js'
import { compileMentionRelations, type RequestRelationTarget } from './relation-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'

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

type CapabilitySnapshot = {
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
} | null

export interface PerformerProjectionInput {
    performerId: string
    performerName: string
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    drafts: Record<string, DraftAsset>
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    executionDir: string
    workingDir: string
    requestTargets?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
    scope?: 'stage' | 'act'
    actId?: string
    extraTools?: Array<{
        name: string
        content: string
    }>
}

export interface EnsuredPerformerProjection {
    compiled: CompiledPerformer
    toolResolution: RuntimeToolResolution
    capabilitySnapshot: CapabilitySnapshot
}

function computeStageHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

function groupKey(performerId: string) {
    return `performer:${performerId}`
}

async function writeIfChanged(filePath: string, content: string) {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) {
        return false
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

async function allMcpToolIds(cwd: string) {
    const oc = await getOpencode()
    const res = await oc.mcp.status({ directory: cwd })
    const statusMap = ((res as any).data || {}) as Record<string, { tools?: Array<{ name?: string }> }>
    return Array.from(
        new Set(
            Object.values(statusMap).flatMap((entry) =>
                (entry?.tools || [])
                    .map((tool) => tool.name || '')
                    .filter(Boolean)
            )
        )
    )
}

function buildProjectedToolMap(allToolIds: string[], resolvedToolIds: string[]) {
    const resolved = new Set(resolvedToolIds)
    return Object.fromEntries(allToolIds.map((toolId) => [toolId, resolved.has(toolId)]))
}

async function resolveCapabilitySnapshot(cwd: string, model: ModelSelection): Promise<CapabilitySnapshot> {
    if (!model) {
        return null
    }
    const runtimeModel = await resolveRuntimeModel(cwd, model)
    if (!runtimeModel) {
        return null
    }
    return {
        toolCall: runtimeModel.toolCall,
        reasoning: runtimeModel.reasoning,
        attachment: runtimeModel.attachment,
        temperature: runtimeModel.temperature,
        modalities: runtimeModel.modalities,
    }
}

export async function ensurePerformerProjection(input: PerformerProjectionInput): Promise<EnsuredPerformerProjection> {
    const stageHash = computeStageHash(input.workingDir)
    const toolResolution = await resolveRuntimeTools(input.executionDir, input.model, input.mcpServerNames)
    const toolMap = buildProjectedToolMap(
        await allMcpToolIds(input.executionDir),
        toolResolution.resolvedTools,
    )

    if (input.extraTools) {
        for (const tool of input.extraTools) {
            toolMap[tool.name] = true
        }
    }

    const skills: CompiledSkill[] = []
    for (const ref of input.danceRefs) {
        skills.push(await compileDance(
            input.executionDir,
            ref,
            input.drafts,
            stageHash,
            input.performerId,
            input.executionDir,
            input.scope || 'stage',
            input.actId,
        ))
    }

    const requestTargets: RequestRelationTarget[] = (input.requestTargets || []).map((target) => ({
        performerId: target.performerId,
        performerName: target.performerName,
        agentName: getProjectedAgentName(input.workingDir, target.performerId, 'build', input.scope, input.actId),
        description: target.description || '',
    }))
    const requestProjection = compileMentionRelations(requestTargets)

    const compiled = await compilePerformer(
        input.executionDir,
        {
            performerId: input.performerId,
            performerName: input.performerName,
            talRef: input.talRef,
            drafts: input.drafts,
            model: input.model,
            modelVariant: input.modelVariant || null,
            stageHash,
            executionDir: input.executionDir,
            scope: input.scope || 'stage',
            actId: input.actId,
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap,
            taskAllowlist: requestProjection.taskAllowlist,
            relationPromptSection: requestProjection.promptSection,
        } satisfies PerformerCompileInput,
        skills,
    )

    let changed = false
    if (input.extraTools) {
        for (const tool of input.extraTools) {
            const toolPath = path.join(input.executionDir, '.opencode', 'tools', `${tool.name}.ts`)
            compiled.allFiles.push(toolPath)
            changed = (await writeIfChanged(toolPath, tool.content)) || changed
        }
    }

    await cleanGroupFiles(input.executionDir, groupKey(input.performerId), compiled.allFiles)

    for (const skill of skills) {
        changed = (await writeIfChanged(skill.filePath, skill.content)) || changed
    }
    changed = (await writeIfChanged(compiled.agentPaths.build, compiled.agentContents.build)) || changed
    changed = (await writeIfChanged(compiled.agentPaths.plan, compiled.agentContents.plan)) || changed

    await updateManifestGroup(
        input.executionDir,
        stageHash,
        groupKey(input.performerId),
        compiled.allFiles,
    )
    await updateGitExclude(input.executionDir)

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: input.executionDir }).catch(() => {})
    }

    return {
        compiled,
        toolResolution,
        capabilitySnapshot: await resolveCapabilitySnapshot(input.executionDir, input.model),
    }
}

export function getProjectedAgentName(
    workingDir: string,
    performerId: string,
    posture: Posture,
    scope: 'stage' | 'act' = 'stage',
    actId?: string,
) {
    const stageHash = computeStageHash(workingDir)
    return resolveAgentIdentity({
        executionDir: workingDir,
        stageHash,
        performerId,
        posture,
        scope,
        actId,
    }).agentName
}
