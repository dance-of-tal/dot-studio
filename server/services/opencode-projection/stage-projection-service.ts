import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { resolveRuntimeTools, type RuntimeToolResolution } from '../../lib/runtime-tools.js'
import { mcpToolPattern } from '../../../shared/mcp-catalog.js'
import {
    cleanGroupFiles,
    markProjectionRuntimePending,
    readManifest,
    toRelativePath,
    updateGitExclude,
    updateManifestGroup,
    resolveAgentIdentity,
    writeManifest,
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
    toolMap: Record<string, boolean>
    capabilitySnapshot: CapabilitySnapshot
    changed: boolean
}

function computeWorkspaceHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

function groupKey(performerId: string) {
    return `performer:${performerId}`
}

export async function pruneStalePerformerProjections(workingDir: string, performerIds: string[]) {
    const manifest = await readManifest(workingDir)
    if (!manifest) {
        return false
    }

    const activeIds = new Set(performerIds)
    const staleKeys = Object.keys(manifest.groups).filter((key) => {
        if (!key.startsWith('performer:')) return false
        const performerId = key.slice('performer:'.length)
        return !activeIds.has(performerId)
    })

    if (staleKeys.length === 0) {
        return false
    }

    for (const key of staleKeys) {
        for (const file of manifest.groups[key] || []) {
            await fs.rm(path.join(workingDir, file), { force: true, recursive: true }).catch(() => {})
        }
        delete manifest.groups[key]
    }

    await writeManifest(workingDir, manifest)
    return true
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

function buildProjectedToolMap(mcpServerNames: string[]) {
    return Object.fromEntries(
        Array.from(new Set(mcpServerNames.filter(Boolean)))
            .sort((left, right) => left.localeCompare(right))
            .map((serverName) => [mcpToolPattern(serverName), true]),
    )
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
    const resolvedServerNames = input.mcpServerNames.filter((serverName) =>
        toolResolution.resolvedTools.includes(mcpToolPattern(serverName)),
    )
    const toolMap = buildProjectedToolMap(resolvedServerNames)

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
        await markProjectionRuntimePending(input.workingDir, workspaceHash)
    }

    return {
        compiled,
        toolResolution,
        toolMap,
        capabilitySnapshot: await resolveCapabilitySnapshot(input.workingDir, input.model),
        changed,
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
