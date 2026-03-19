import {
    applySafeOwnerChanges,
    discardAllSafeOwnerChanges,
    discardSafeOwnerFile,
    getSafeOwnerSummary,
    undoLastSafeOwnerApply,
} from '../lib/safe-mode.js'
import type { SafeOwnerKind } from '../../shared/safe-mode.js'

const applyQueues = new Map<string, Promise<unknown>>()

export function parseSafeOwnerKind(value: string): SafeOwnerKind | null {
    return value === 'performer' || value === 'act' ? value : null
}

async function runQueued<T>(workingDir: string, task: () => Promise<T>) {
    const current = applyQueues.get(workingDir) || Promise.resolve()
    const next = current.catch(() => undefined).then(task)
    applyQueues.set(workingDir, next)
    try {
        return await next
    } finally {
        if (applyQueues.get(workingDir) === next) {
            applyQueues.delete(workingDir)
        }
    }
}

export async function readSafeOwnerSummary(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    return getSafeOwnerSummary(workingDir, ownerKind, ownerId)
}

export async function applySafeOwnerSummary(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    return runQueued(workingDir, () => applySafeOwnerChanges(workingDir, ownerKind, ownerId))
}

export async function discardSafeOwnerSummaryFile(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
    filePath: string,
) {
    return discardSafeOwnerFile(workingDir, ownerKind, ownerId, filePath)
}

export async function discardAllSafeOwnerSummaryChanges(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    return discardAllSafeOwnerChanges(workingDir, ownerKind, ownerId)
}

export async function undoLastSafeOwnerSummaryApply(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    return runQueued(workingDir, () => undoLastSafeOwnerApply(workingDir, ownerKind, ownerId))
}
