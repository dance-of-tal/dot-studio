import type { SavedWorkspaceSummary } from '../types';

export type StartupWorkspaceConfig = {
    projectDir?: string;
    lastWorkspaceId?: string;
};

export type StartupWorkspaceTarget =
    | { kind: 'workspace'; workspaceId: string }
    | { kind: 'project-dir'; projectDir: string }
    | { kind: 'none' };

function normalizeStartupPath(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\/+$/, '') || '';
    return normalized || null;
}

export function resolveStartupWorkspaceTarget(
    config: StartupWorkspaceConfig,
    workspaces: SavedWorkspaceSummary[],
): StartupWorkspaceTarget {
    const normalizedProjectDir = normalizeStartupPath(config.projectDir);

    if (normalizedProjectDir) {
        const matchingWorkspace = workspaces.find(
            (workspace) => normalizeStartupPath(workspace.workingDir) === normalizedProjectDir,
        );

        if (matchingWorkspace) {
            return {
                kind: 'workspace',
                workspaceId: matchingWorkspace.id,
            };
        }

        return {
            kind: 'project-dir',
            projectDir: normalizedProjectDir,
        };
    }

    if (config.lastWorkspaceId) {
        const matchingWorkspace = workspaces.find((workspace) => workspace.id === config.lastWorkspaceId);
        if (matchingWorkspace) {
            return {
                kind: 'workspace',
                workspaceId: config.lastWorkspaceId,
            };
        }
    }

    return { kind: 'none' };
}
