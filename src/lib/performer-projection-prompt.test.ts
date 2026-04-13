import { describe, expect, it, vi } from 'vitest'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { compilePerformer } from '../../server/services/opencode-projection/performer-compiler.js'
import { getCompileRequestTargets } from '../../server/services/opencode-projection/preview-service.js'

vi.mock('../../server/lib/model-catalog.js', () => ({
    resolveRuntimeModel: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../server/services/draft-service.js', () => ({
    readDraftTextContent: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../server/lib/dot-source.js', () => ({
    getAssetPayload: vi.fn().mockResolvedValue(null),
}))

describe('performer prompt projection', () => {
    it('uses canonical requestTargets only', () => {
        const canonical: CompilePromptRequest = {
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            requestTargets: [{ performerId: 'peer-1', performerName: 'Peer One', description: 'Reviewer' }],
        }

        expect(getCompileRequestTargets(canonical)).toEqual(canonical.requestTargets)
        expect(getCompileRequestTargets({ talRef: null, danceRefs: [], model: { provider: 'openai', modelId: 'gpt-5' } })).toEqual([])
    })

    it('compiles stable performer prompt sections into the agent body', async () => {
        const compiled = await compilePerformer(
            '/Users/junhoyoon/windsurfpjt/dance-of-tal/studio',
            {
                performerId: 'reviewer',
                performerName: 'Reviewer',
                talRef: null,
                model: { provider: 'openai', modelId: 'gpt-5' },
                modelVariant: null,
                workspaceHash: 'workspacehash',
                executionDir: '/tmp/performer-projection-test',
                scope: 'stage',
                skillNames: [],
                toolMap: { task: true },
                taskAllowlist: ['agent_peer'],
                relationPromptSection: '# Available Agents\n\n- **Peer**: use `task` with agent="agent_peer"',
            },
            [],
        )

        const system = compiled.agentContents.build
        expect(system).toContain('# Available Agents')
        expect(system).toContain('agent="agent_peer"')
    })

    it('omits a synthetic TAL section when no TAL is configured', async () => {
        const compiled = await compilePerformer(
            '/Users/junhoyoon/windsurfpjt/dance-of-tal/studio',
            {
                performerId: 'reviewer',
                performerName: 'Reviewer',
                talRef: null,
                model: { provider: 'openai', modelId: 'gpt-5' },
                modelVariant: null,
                workspaceHash: 'workspacehash',
                executionDir: '/tmp/performer-projection-test',
                scope: 'stage',
                skillNames: [],
                toolMap: {},
            },
            [],
        )

        const system = compiled.agentContents.build
        expect(system).not.toContain('# Core Instructions')
        expect(system).not.toContain('No core instruction asset is configured.')
    })
})
