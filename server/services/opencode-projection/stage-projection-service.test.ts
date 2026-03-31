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

        await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: { kind: 'draft', draftId: 'tal-draft-1' },
            danceRefs: [{ kind: 'draft', draftId: 'dance-draft-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

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
    })
})
