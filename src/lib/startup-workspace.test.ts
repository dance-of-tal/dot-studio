import { describe, expect, it } from 'vitest';
import { resolveStartupWorkspaceTarget } from './startup-workspace';

describe('resolveStartupWorkspaceTarget', () => {
    it('restores the saved workspace for the requested project directory', () => {
        const target = resolveStartupWorkspaceTarget(
            {
                projectDir: '/tmp/project-a',
                lastWorkspaceId: 'workspace-b',
            },
            [
                { id: 'workspace-a', workingDir: '/tmp/project-a', updatedAt: 1 },
                { id: 'workspace-b', workingDir: '/tmp/project-b', updatedAt: 2 },
            ],
        );

        expect(target).toEqual({
            kind: 'workspace',
            workspaceId: 'workspace-a',
        });
    });

    it('opens the requested directory directly when no saved workspace matches it', () => {
        const target = resolveStartupWorkspaceTarget(
            {
                projectDir: '/tmp/project-a',
                lastWorkspaceId: 'workspace-b',
            },
            [
                { id: 'workspace-b', workingDir: '/tmp/project-b', updatedAt: 2 },
            ],
        );

        expect(target).toEqual({
            kind: 'project-dir',
            projectDir: '/tmp/project-a',
        });
    });

    it('falls back to the last workspace only when no project directory was provided', () => {
        const target = resolveStartupWorkspaceTarget(
            {
                lastWorkspaceId: 'workspace-b',
            },
            [],
        );

        expect(target).toEqual({
            kind: 'workspace',
            workspaceId: 'workspace-b',
        });
    });

    it('normalizes trailing slashes before matching directories', () => {
        const target = resolveStartupWorkspaceTarget(
            {
                projectDir: '/tmp/project-a/',
            },
            [
                { id: 'workspace-a', workingDir: '/tmp/project-a', updatedAt: 1 },
            ],
        );

        expect(target).toEqual({
            kind: 'workspace',
            workspaceId: 'workspace-a',
        });
    });
});
