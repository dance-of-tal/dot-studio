import { getOpencode } from '../lib/opencode.js'
import { StudioValidationError } from '../lib/opencode-errors.js'
import {
    clearProjectionRuntimePending,
    hasPendingProjectionRuntimeAdoption,
} from './opencode-projection/projection-manifest.js'
import { countRunningSessions } from './runtime-reload-service.js'

export type PreparedRuntimeResult<T> = {
    appliedReload: boolean
    requiresDispose: boolean
    blocked: boolean
    reason: 'projection_update_pending' | null
    payload: T
}

export async function prepareRuntimeForExecution<T extends { changed?: boolean }>(
    workingDir: string,
    buildPayload: () => Promise<T>,
): Promise<PreparedRuntimeResult<T>> {
    const payload = await buildPayload()
    const hasPendingProjectionAdoption = await hasPendingProjectionRuntimeAdoption(workingDir)
    const requiresDispose = payload.changed === true || hasPendingProjectionAdoption

    if (!requiresDispose) {
        return {
            appliedReload: false,
            requiresDispose: false,
            blocked: false,
            reason: null,
            payload,
        }
    }

    const { runningSessions } = await countRunningSessions(workingDir)
    if (runningSessions > 0) {
        return {
            appliedReload: false,
            requiresDispose: true,
            blocked: true,
            reason: 'projection_update_pending',
            payload,
        }
    }

    const oc = await getOpencode()
    await oc.instance.dispose({ directory: workingDir }).catch(() => {})
    await clearProjectionRuntimePending(workingDir).catch(() => {})
    return {
        appliedReload: true,
        requiresDispose: true,
        blocked: false,
        reason: null,
        payload,
    }
}

export function throwIfRuntimePreparationBlocked(
    prepared: Pick<PreparedRuntimeResult<unknown>, 'blocked' | 'reason'>,
) {
    if (!prepared.blocked) {
        return
    }

    throw new StudioValidationError(
        prepared.reason === 'projection_update_pending'
            ? 'You cannot start a new chat while another Studio session is still running. Wait for the current run to finish, then try again.'
            : 'Studio could not prepare the latest runtime state.',
        'fix_input',
    )
}
