import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import {
    mergeProjectionDirtyPatches,
    type ProjectionDirtyPatch,
} from '../../../shared/projection-dirty.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import {
    listWorkspacePerformersForDir,
    type WorkspacePerformerSnapshot,
} from '../workspace-service.js'
import type { PerformerProjectionInput } from './stage-projection-service.js'

type ProjectionTargetInput = {
    performerId: string
    performerName: string
    talRef: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
}

export type ProjectionExecutionPlan = {
    consumedPatch: ProjectionDirtyPatch
    inputs: PerformerProjectionInput[]
}

function performerToProjectionInput(
    performer: WorkspacePerformerSnapshot,
    workingDir: string,
): PerformerProjectionInput | null {
    if (!performer.model) {
        return null
    }

    return {
        performerId: performer.id,
        performerName: performer.name,
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        workingDir,
        scope: 'workspace',
    }
}

function shouldExpandToWorkspace(patch: ProjectionDirtyPatch) {
    return patch.workspaceWide === true
        || (patch.actIds?.length || 0) > 0
        || (patch.draftIds?.length || 0) > 0
}

export async function buildProjectionExecutionPlan(input: {
    workingDir: string
    target: ProjectionTargetInput
    targetPatch: ProjectionDirtyPatch
    requestedPatch?: ProjectionDirtyPatch | null
}): Promise<ProjectionExecutionPlan> {
    const consumedPatch = mergeProjectionDirtyPatches(input.targetPatch, input.requestedPatch)
    const inputs = new Map<string, PerformerProjectionInput>([
        [input.target.performerId, { ...input.target }],
    ])

    const requestedPerformerIds = new Set(consumedPatch.performerIds || [])
    if (requestedPerformerIds.size === 0 && !shouldExpandToWorkspace(consumedPatch)) {
        return {
            consumedPatch,
            inputs: Array.from(inputs.values()),
        }
    }

    const workspacePerformers = await listWorkspacePerformersForDir(input.workingDir)
    const includeAllWorkspacePerformers = shouldExpandToWorkspace(consumedPatch)

    for (const performer of workspacePerformers) {
        if (!includeAllWorkspacePerformers && !requestedPerformerIds.has(performer.id)) {
            continue
        }
        if (inputs.has(performer.id)) {
            continue
        }
        const projectionInput = performerToProjectionInput(performer, input.workingDir)
        if (!projectionInput) {
            continue
        }
        inputs.set(performer.id, projectionInput)
    }

    return {
        consumedPatch,
        inputs: Array.from(inputs.values()),
    }
}
