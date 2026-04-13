import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const compileDanceMock = vi.fn()
const compilePerformerMock = vi.fn()
const resolveRuntimeToolsMock = vi.fn()
const resolveRuntimeModelMock = vi.fn()
const mcpStatusMock = vi.fn()
const instanceDisposeMock = vi.fn()

vi.mock('./dance-compiler.js', () => ({
    compileDance: compileDanceMock,
}))

vi.mock('./performer-compiler.js', () => ({
    compilePerformer: compilePerformerMock,
}))

vi.mock('../../lib/runtime-tools.js', () => ({
    resolveRuntimeTools: resolveRuntimeToolsMock,
}))

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        mcp: { status: mcpStatusMock },
        instance: { dispose: instanceDisposeMock },
    }),
}))

describe('ensurePerformerProjection source boundaries', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-working-'))

        compileDanceMock.mockReset().mockResolvedValue({
            logicalName: 'draft-dance',
            description: 'Draft dance',
            filePath: path.join(workingDir, '.opencode', 'skills', 'draft-dance', 'SKILL.md'),
            relativePath: '.opencode/skills/draft-dance/SKILL.md',
            content: '---\nname: "draft-dance"\n---\n\nbody',
            additionalFiles: [],
            bundleChanged: false,
        })
        compilePerformerMock.mockReset().mockResolvedValue({
            performerId: 'performer-1',
            agentNames: { build: 'dot-studio/workspace/hash/performer-1--build' },
            agentPaths: {
                build: path.join(workingDir, '.opencode', 'agents', 'dot-studio', 'workspace', 'hash', 'performer-1--build.md'),
            },
            agentContents: {
                build: '---\ndescription: "Agent: Performer"\nmode: primary\n---\n\nbody',
            },
            skills: [],
            projectionHash: 'hash',
            allFiles: ['.opencode/agents/dot-studio/workspace/hash/performer-1--build.md'],
        })
        resolveRuntimeToolsMock.mockReset().mockResolvedValue({
            selectedMcpServers: [],
            requestedTools: [],
            availableTools: [],
            resolvedTools: [],
            unavailableTools: [],
            unavailableDetails: [],
        })
        resolveRuntimeModelMock.mockReset().mockResolvedValue(null)
        mcpStatusMock.mockReset().mockResolvedValue({ data: {} })
        instanceDisposeMock.mockReset().mockResolvedValue({})
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('uses workingDir, not executionDir, to resolve draft Tal and Dance sources', async () => {
        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: { kind: 'draft', draftId: 'tal-draft-1' },
            danceRefs: [{ kind: 'draft', draftId: 'dance-draft-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compileDanceMock).toHaveBeenCalledWith(
            workingDir,
            { kind: 'draft', draftId: 'dance-draft-1' },
            expect.any(String),
            'performer-1',
            workingDir,
            'workspace',
            undefined,
        )
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                performerId: 'performer-1',
                talRef: { kind: 'draft', draftId: 'tal-draft-1' },
                executionDir: workingDir,
            }),
            expect.any(Array),
        )
        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'dot-studio.manifest.json'), 'utf-8'))
        expect(manifest.runtime).toEqual(expect.objectContaining({
            projectionPending: true,
        }))
    })

    it('projects performer MCP access as server glob patterns', async () => {
        resolveRuntimeToolsMock.mockResolvedValueOnce({
            selectedMcpServers: ['github'],
            requestedTools: ['github_*'],
            availableTools: ['github_*'],
            resolvedTools: ['github_*'],
            unavailableTools: [],
            unavailableDetails: [],
        })

        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: ['github'],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                toolMap: {
                    'github_*': true,
                },
            }),
            expect.any(Array),
        )
    })

    it('keeps act collaboration context out of projected agent files', async () => {
        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const first = await ensurePerformerProjection({
            performerId: 'Lead',
            performerName: 'Lead',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'act',
            actId: 'act-1',
        })
        const second = await ensurePerformerProjection({
            performerId: 'Lead',
            performerName: 'Lead',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'act',
            actId: 'act-1',
        })

        expect(first.changed).toBe(true)
        expect(second.changed).toBe(false)
        expect(compilePerformerMock).toHaveBeenNthCalledWith(
            1,
            workingDir,
            expect.objectContaining({
                scope: 'act',
            }),
            expect.any(Array),
        )
        expect(compilePerformerMock).toHaveBeenNthCalledWith(
            2,
            workingDir,
            expect.objectContaining({
                scope: 'act',
            }),
            expect.any(Array),
        )
    })

    it('prunes stale performer agent files from the manifest', async () => {
        const workspaceHash = 'hash'
        const activeBuild = path.join(workingDir, '.opencode', 'agents', 'dot-studio', 'workspace', workspaceHash, 'performer-1--build.md')
        const activePlan = path.join(workingDir, '.opencode', 'agents', 'dot-studio', 'workspace', workspaceHash, 'performer-1--plan.md')
        const staleBuild = path.join(workingDir, '.opencode', 'agents', 'dot-studio', 'workspace', workspaceHash, 'performer-2--build.md')
        const stalePlan = path.join(workingDir, '.opencode', 'agents', 'dot-studio', 'workspace', workspaceHash, 'performer-2--plan.md')

        await fs.mkdir(path.dirname(activeBuild), { recursive: true })
        await fs.writeFile(activeBuild, 'active build', 'utf-8')
        await fs.writeFile(activePlan, 'active plan', 'utf-8')
        await fs.writeFile(staleBuild, 'stale build', 'utf-8')
        await fs.writeFile(stalePlan, 'stale plan', 'utf-8')
        await fs.writeFile(
            path.join(workingDir, '.opencode', 'dot-studio.manifest.json'),
            JSON.stringify({
                version: 1,
                owner: 'dot-studio',
                workspaceHash,
                groups: {
                    'performer:performer-1': [
                        '.opencode/agents/dot-studio/workspace/hash/performer-1--build.md',
                        '.opencode/agents/dot-studio/workspace/hash/performer-1--plan.md',
                    ],
                    'performer:performer-2': [
                        '.opencode/agents/dot-studio/workspace/hash/performer-2--build.md',
                        '.opencode/agents/dot-studio/workspace/hash/performer-2--plan.md',
                    ],
                },
            }, null, 2),
            'utf-8',
        )

        const { pruneStalePerformerProjections } = await import('./stage-projection-service.js')
        const changed = await pruneStalePerformerProjections(workingDir, ['performer-1'])

        expect(changed).toBe(true)
        await expect(fs.access(activeBuild)).resolves.toBeUndefined()
        await expect(fs.access(activePlan)).resolves.toBeUndefined()
        await expect(fs.access(staleBuild)).rejects.toBeTruthy()
        await expect(fs.access(stalePlan)).rejects.toBeTruthy()

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'dot-studio.manifest.json'), 'utf-8'))
        expect(manifest.groups).toEqual({
            'performer:performer-1': [
                '.opencode/agents/dot-studio/workspace/hash/performer-1--build.md',
                '.opencode/agents/dot-studio/workspace/hash/performer-1--plan.md',
            ],
        })
        expect(instanceDisposeMock).not.toHaveBeenCalled()
    })
})
