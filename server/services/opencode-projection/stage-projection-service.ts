import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getOpencode } from '../../lib/opencode.js'
import type { ProjectMcpLiveStatusMap } from '../../lib/project-config.js'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { resolveRuntimeTools, type RuntimeToolResolution } from '../../lib/runtime-tools.js'
import {
    cleanGroupFiles,
    toRelativePath,
    updateGitExclude,
    updateManifestGroup,
    resolveAgentIdentity,
} from './projection-manifest.js'
import { compileDance, type CompiledSkill } from './dance-compiler.js'
import { compilePerformer, type CompiledPerformer, type PerformerCompileInput, type Posture } from './performer-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { COLLABORATION_TOOL_NAMES, LEGACY_COLLABORATION_TOOL_NAMES } from '../act-runtime/act-tools.js'

// ── @mention relation support (inlined from deleted relation-compiler.ts) ──

interface RequestRelationTarget {
    performerId: string
    performerName: string
    agentName: string
    description?: string
}

interface CompiledRequestRelations {
    taskAllowlist: string[]
    promptSection: string | null
}

function compileMentionRelations(targets: RequestRelationTarget[]): CompiledRequestRelations {
    if (targets.length === 0) {
        return { taskAllowlist: [], promptSection: null }
    }
    const lines = [
        '# Available Agents',
        '',
        'The following agents are available for @mention in this context.',
        'Use the `task` tool only when it is actually useful, and only with the allowed agent names below.',
        '',
    ]
    for (const target of targets) {
        lines.push(`- **${target.performerName}**: use \`task\` with agent="${target.agentName}"${target.description ? ` — ${target.description}` : ''}`)
    }
    return {
        taskAllowlist: targets.map((target) => target.agentName),
        promptSection: lines.join('\n'),
    }
}

type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }



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
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
    requestTargets?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
    scope?: 'workspace' | 'act'
    actId?: string
    collaborationPromptSection?: string | null
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

function computeWorkspaceHash(workingDir: string) {
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

async function allMcpToolIds(cwd: string): Promise<string[]> {
    const oc = await getOpencode()
    const res = await oc.mcp.status({ directory: cwd })
    const statusMap = ((res && typeof res === 'object' && 'data' in res ? res.data : {}) || {}) as ProjectMcpLiveStatusMap
    return Array.from(
        new Set(
            Object.values(statusMap).flatMap((entry) =>
                (entry?.tools || [])
                    .map((tool) => (typeof tool?.name === 'string' ? tool.name : ''))
                    .filter((toolId): toolId is string => toolId.length > 0)
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
    const workspaceHash = computeWorkspaceHash(input.workingDir)
    const toolResolution = await resolveRuntimeTools(input.workingDir, input.model, input.mcpServerNames)
    const toolMap = buildProjectedToolMap(
        await allMcpToolIds(input.workingDir),
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
            input.workingDir,
            ref,
            workspaceHash,
            input.performerId,
            input.workingDir,
            input.scope || 'workspace',
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
    const compileScope = input.scope === 'workspace' ? 'stage' : input.scope

    const compiled = await compilePerformer(
        input.workingDir,
        {
            performerId: input.performerId,
            performerName: input.performerName,
            talRef: input.talRef,
            model: input.model,
            modelVariant: input.modelVariant || null,
            workspaceHash,
            executionDir: input.workingDir,
            scope: compileScope || 'stage',
            actId: input.actId,
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap,
            taskAllowlist: requestProjection.taskAllowlist,
            collaborationPromptSection: input.collaborationPromptSection || null,
            relationPromptSection: requestProjection.promptSection,
        } satisfies PerformerCompileInput,
        skills,
    )

    let changed = false
    if (input.extraTools) {
        // Clean stale act tool files that don't belong to the current extra tools set.
        // This prevents zombie tools from deleted/renamed acts lingering in OpenCode's cache.
        const currentToolNames = new Set<string>(input.extraTools.map((t) => t.name))
        const collaborationToolNames = new Set<string>([
            ...COLLABORATION_TOOL_NAMES,
            ...LEGACY_COLLABORATION_TOOL_NAMES,
        ])
        const toolsDir = path.join(input.workingDir, '.opencode', 'tools')
        try {
            const existing = await fs.readdir(toolsDir)
            for (const file of existing) {
                if (file.endsWith('.ts')) {
                    const toolName = file.replace(/\.ts$/, '')
                    if (collaborationToolNames.has(toolName) && !currentToolNames.has(toolName)) {
                        await fs.rm(path.join(toolsDir, file), { force: true }).catch(() => {})
                        changed = true
                    }
                }
            }
        } catch {
            // tools dir may not exist yet
        }

        for (const tool of input.extraTools) {
            const toolPath = path.join(input.workingDir, '.opencode', 'tools', `${tool.name}.ts`)
            compiled.allFiles.push(toRelativePath(input.workingDir, toolPath))
            changed = (await writeIfChanged(toolPath, tool.content)) || changed
        }
    }

    await cleanGroupFiles(input.workingDir, groupKey(input.performerId), compiled.allFiles)

    for (const skill of skills) {
        changed = (await writeIfChanged(skill.filePath, skill.content)) || changed
        changed = skill.bundleChanged || changed
    }
    changed = (await writeIfChanged(compiled.agentPaths.build!, compiled.agentContents.build!)) || changed
    if (compiled.agentPaths.plan && compiled.agentContents.plan) {
        changed = (await writeIfChanged(compiled.agentPaths.plan, compiled.agentContents.plan)) || changed
    }

    await updateManifestGroup(
        input.workingDir,
        workspaceHash,
        groupKey(input.performerId),
        compiled.allFiles,
    )
    await updateGitExclude(input.workingDir)

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: input.workingDir }).catch(() => {})
    }

    return {
        compiled,
        toolResolution,
        capabilitySnapshot: await resolveCapabilitySnapshot(input.workingDir, input.model),
    }
}

export function getProjectedAgentName(
    workingDir: string,
    performerId: string,
    posture: Posture,
    scope: 'workspace' | 'act' = 'workspace',
    actId?: string,
) {
    const workspaceHash = computeWorkspaceHash(workingDir)
    return resolveAgentIdentity({
        executionDir: workingDir,
        workspaceHash,
        performerId,
        posture,
        scope,
        actId,
    }).agentName
}
