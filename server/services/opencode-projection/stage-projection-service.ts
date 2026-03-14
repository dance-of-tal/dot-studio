import { createHash } from 'crypto'
import { compilePerformer, agentName, type PerformerCompileInput, type CompiledPerformer, type Posture } from './performer-compiler.js'
import { writeManifest, cleanStaleFiles, updateGitExclude, type ProjectionManifest } from './projection-manifest.js'

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

export interface PerformerProjectionInput {
    performerId: string
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    description?: string
    planMode?: boolean
}

interface ProjectionCache {
    stageHash: string
    compiledPerformers: Map<string, CompiledPerformer>
    dirty: boolean
}

let cache: ProjectionCache | null = null

function computeStageHash(workingDir: string): string {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

export async function ensureProjection(
    cwd: string,
    workingDir: string,
    performers: PerformerProjectionInput[],
    drafts: Record<string, DraftAsset>,
): Promise<void> {
    const stageHash = computeStageHash(workingDir)

    // Check if we need to recompile
    if (cache && cache.stageHash === stageHash && !cache.dirty) {
        return
    }

    const allFiles: string[] = []
    const compiledMap = new Map<string, CompiledPerformer>()

    for (const performer of performers) {
        const input: PerformerCompileInput = {
            performerId: performer.performerId,
            talRef: performer.talRef,
            danceRefs: performer.danceRefs,
            drafts,
            model: performer.model,
            modelVariant: performer.modelVariant,
            mcpServerNames: performer.mcpServerNames,
            description: performer.description,
            cwd,
            workingDir,
            stageHash,
        }

        const compiled = await compilePerformer(input)
        compiledMap.set(performer.performerId, compiled)
        allFiles.push(...compiled.allFiles)
    }

    // Clean stale files from previous projection
    await cleanStaleFiles(workingDir, allFiles)

    // Write manifest
    const manifest: ProjectionManifest = {
        version: 1,
        owner: 'dot-studio',
        stageHash,
        files: allFiles,
    }
    await writeManifest(workingDir, manifest)
    allFiles.push('.opencode/dot-studio.manifest.json')

    // Update git exclude
    await updateGitExclude(workingDir)

    cache = {
        stageHash,
        compiledPerformers: compiledMap,
        dirty: false,
    }
}

export function markProjectionDirty(): void {
    if (cache) {
        cache.dirty = true
    }
}

export function getProjectedAgentName(
    workingDir: string,
    performerId: string,
    posture: Posture,
): string {
    const stageHash = computeStageHash(workingDir)
    return agentName(stageHash, performerId, posture)
}

export function getProjectionHash(performerId: string): string | null {
    if (!cache) {
        return null
    }
    return cache.compiledPerformers.get(performerId)?.projectionHash || null
}

export function getCompiledPerformer(performerId: string): CompiledPerformer | null {
    if (!cache) {
        return null
    }
    return cache.compiledPerformers.get(performerId) || null
}
