import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ActDefinition, BoardEntry } from '../../../shared/act-types.js'

async function makeTempStudioDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-act-runtime-'))
}

async function importThreadManagerWithStudioDir(studioDir: string) {
    process.env.STUDIO_DIR = studioDir
    vi.resetModules()
    return import('./thread-manager.js')
}

async function cleanupStudioDir(studioDir: string) {
    await fs.rm(studioDir, { recursive: true, force: true })
}

const baseActDefinition: ActDefinition = {
    id: 'act-review',
    name: 'Review Team',
    participants: {
        Lead: {
            performerRef: { kind: 'draft', draftId: 'lead-v1' },
        },
        Researcher: {
            performerRef: { kind: 'draft', draftId: 'researcher-v1' },
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Lead', 'Researcher'],
            direction: 'both',
            name: 'Review Loop',
            description: 'Exchange findings and approvals.',
        },
    ],
}

afterEach(() => {
    delete process.env.STUDIO_DIR
    vi.resetModules()
})

describe('ThreadManager full-rewrite persistence', () => {
    it('hard-resets incompatible persisted thread snapshots', async () => {
        const studioDir = await makeTempStudioDir()
        try {
            const workspaceId = 'workspace-1'
            const actId = 'act-1'
            const threadId = 'thread-1'
            const threadDir = path.join(studioDir, 'workspaces', workspaceId, 'act-runtime', actId, threadId)
            await fs.mkdir(threadDir, { recursive: true })
            await fs.writeFile(path.join(threadDir, 'thread.json'), JSON.stringify({
                thread: {
                    id: threadId,
                    actId,
                    mailbox: { pendingMessages: [], board: {}, wakeConditions: [] },
                    participantSessions: {},
                    participantStatuses: {},
                    createdAt: Date.now(),
                    status: 'active',
                },
            }, null, 2))

            const { ThreadManager } = await importThreadManagerWithStudioDir(studioDir)
            const manager = new ThreadManager(workspaceId, '/tmp/workspace')
            await manager.loadPersistedThreads()

            expect(manager.listThreadIds(actId)).toEqual([])
            await expect(fs.stat(threadDir)).rejects.toThrow()
        } finally {
            await cleanupStudioDir(studioDir)
        }
    })

    it('restores board entries from board.json while keeping pending mailbox state from thread snapshots', async () => {
        const studioDir = await makeTempStudioDir()
        try {
            const workspaceId = 'workspace-2'
            const actId = 'act-2'
            const threadId = 'thread-2'
            const threadDir = path.join(studioDir, 'workspaces', workspaceId, 'act-runtime', actId, threadId)
            const pendingMessage = {
                id: 'msg-1',
                from: 'Lead',
                to: 'Researcher',
                content: 'Please pick this back up after restart.',
                timestamp: Date.now(),
                status: 'pending' as const,
            }
            const wakeCondition = {
                id: 'wait-1',
                target: 'self' as const,
                createdBy: 'Researcher',
                createdAt: Date.now(),
                onSatisfiedMessage: 'Resume when review-summary exists.',
                condition: { type: 'board_key_exists' as const, key: 'review-summary' },
                status: 'waiting' as const,
            }
            const artifactEntry: BoardEntry = {
                id: 'entry-1',
                key: 'artifact-report',
                kind: 'artifact',
                author: 'Lead',
                content: 'Latest artifact',
                ownership: 'authoritative',
                updateMode: 'replace',
                version: 1,
                timestamp: Date.now(),
            }

            await fs.mkdir(threadDir, { recursive: true })
            await fs.writeFile(path.join(threadDir, 'thread.json'), JSON.stringify({
                schemaVersion: 2,
                thread: {
                    id: threadId,
                    actId,
                    mailbox: {
                        pendingMessages: [pendingMessage],
                        board: {
                            'stale-board-key': {
                                id: 'stale-entry',
                                key: 'stale-board-key',
                                kind: 'artifact',
                                author: 'Lead',
                                content: 'stale',
                                ownership: 'authoritative',
                                updateMode: 'replace',
                                version: 1,
                                timestamp: Date.now(),
                            },
                        },
                        wakeConditions: [wakeCondition],
                    },
                    participantSessions: {},
                    participantStatuses: {},
                    retiredParticipantSessions: {},
                    createdAt: Date.now(),
                    status: 'active',
                },
                actDefinition: baseActDefinition,
            }, null, 2))
            await fs.writeFile(path.join(threadDir, 'board.json'), JSON.stringify([artifactEntry], null, 2))

            const { ThreadManager } = await importThreadManagerWithStudioDir(studioDir)
            const manager = new ThreadManager(workspaceId, '/tmp/workspace')
            await manager.loadPersistedThreads()

            const thread = manager.getThread(threadId)
            expect(thread?.mailbox.board).toEqual({
                [artifactEntry.key]: artifactEntry,
            })
            expect(thread?.mailbox.pendingMessages).toEqual([pendingMessage])
            expect(thread?.mailbox.wakeConditions).toEqual([wakeCondition])
        } finally {
            await cleanupStudioDir(studioDir)
        }
    })

    it('retires current participant sessions when performer refs change or participants are removed', async () => {
        const studioDir = await makeTempStudioDir()
        try {
            const workspaceId = 'workspace-3'
            const { ThreadManager } = await importThreadManagerWithStudioDir(studioDir)
            const manager = new ThreadManager(workspaceId, '/tmp/workspace')
            const thread = await manager.createThread(baseActDefinition.id, baseActDefinition)

            await manager.getOrCreateSession(thread.id, 'Lead', () => 'session-lead-v1')
            await manager.getOrCreateSession(thread.id, 'Researcher', () => 'session-researcher-v1')

            await manager.syncThreadActDefinition(thread.id, {
                ...baseActDefinition,
                participants: {
                    Lead: {
                        performerRef: { kind: 'draft', draftId: 'lead-v2' },
                    },
                },
                relations: [],
            })

            expect(manager.getPerformerSession(thread.id, 'Lead')).toBeNull()
            expect(manager.getPerformerSession(thread.id, 'Researcher')).toBeNull()

            const snapshotPath = path.join(
                studioDir,
                'workspaces',
                workspaceId,
                'act-runtime',
                baseActDefinition.id,
                thread.id,
                'thread.json',
            )
            const raw = JSON.parse(await fs.readFile(snapshotPath, 'utf-8')) as {
                thread: { retiredParticipantSessions: Record<string, string[]> }
            }

            expect(raw.thread.retiredParticipantSessions).toEqual({
                Lead: ['session-lead-v1'],
                Researcher: ['session-researcher-v1'],
            })
        } finally {
            await cleanupStudioDir(studioDir)
        }
    })

    it('persists server-authoritative thread names in thread snapshots', async () => {
        const studioDir = await makeTempStudioDir()
        try {
            const workspaceId = 'workspace-4'
            const { ThreadManager } = await importThreadManagerWithStudioDir(studioDir)
            const manager = new ThreadManager(workspaceId, '/tmp/workspace')
            const thread = await manager.createThread(baseActDefinition.id, baseActDefinition)

            const updated = await manager.setThreadName(thread.id, 'API regression investigation')

            expect(updated?.name).toBe('API regression investigation')
            expect(manager.getThreadSummary(thread.id)?.name).toBe('API regression investigation')

            const snapshotPath = path.join(
                studioDir,
                'workspaces',
                workspaceId,
                'act-runtime',
                baseActDefinition.id,
                thread.id,
                'thread.json',
            )
            const raw = JSON.parse(await fs.readFile(snapshotPath, 'utf-8')) as {
                thread: { name?: string }
            }

            expect(raw.thread.name).toBe('API regression investigation')
        } finally {
            await cleanupStudioDir(studioDir)
        }
    })
})
