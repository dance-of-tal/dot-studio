import { getActiveProjectDir } from '../../lib/config.js'
import { isManagedOpencode } from '../../lib/opencode-sidecar.js'
import { listSavedWorkspaces } from '../workspace-service.js'
import { ensureAssistantAgent } from './assistant-service.js'

function uniqueNonEmptyDirs(directories: Array<string | null | undefined>) {
    return Array.from(new Set(
        directories
            .map((directory) => (typeof directory === 'string' ? directory.trim() : ''))
            .filter(Boolean),
    ))
}

export async function refreshAssistantProjectionOnServerStartup() {
    if (!isManagedOpencode()) {
        return
    }

    const savedWorkspaces = await listSavedWorkspaces(true).catch(() => [])
    const candidateDirs = uniqueNonEmptyDirs([
        getActiveProjectDir(),
        ...savedWorkspaces.map((workspace) => workspace.workingDir),
    ])

    for (const directory of candidateDirs) {
        try {
            await ensureAssistantAgent(directory)
        } catch (error) {
            console.warn('[assistant-startup] Failed to refresh assistant projection', {
                directory,
                error,
            })
        }
    }
}
