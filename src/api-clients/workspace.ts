import { absolutizeWorkspacePath, fetchJSON, normalizeWorkspaceFileEntry, resolveWorkingDirContext } from '../api-core'
import type { WorkspaceFileEntry } from '../api-core'

export const workspaceApi = {
    findFiles: async (query: string) => {
        const normalized = query.trim()

        if (!normalized) {
            const entries = await fetchJSON<WorkspaceFileEntry[]>(`/api/file/list?path=${encodeURIComponent('.')}`)
            return entries
                .map((entry) => normalizeWorkspaceFileEntry(entry))
                .filter((entry) => entry.type === 'file')
                .map((entry) => ({
                    name: entry.name,
                    path: entry.path,
                    absolute: absolutizeWorkspacePath(entry.absolute || entry.path, resolveWorkingDirContext()),
                    type: entry.type,
                }))
        }

        const entries = await fetchJSON<Array<string | {
            name: string
            path: string
            absolute: string
            type: string
        }>>(`/api/find/files?pattern=${encodeURIComponent(normalized)}`)

        return entries
            .map((entry) => normalizeWorkspaceFileEntry(entry))
            .filter((entry) => entry.type === 'file')
    },
}
