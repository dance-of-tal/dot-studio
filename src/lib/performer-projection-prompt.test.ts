import { describe, expect, it } from 'vitest'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { compilePerformer } from '../../server/services/opencode-projection/performer-compiler.js'
import { getCompileRequestTargets } from '../../server/services/opencode-projection/preview-service.js'

describe('performer prompt projection', () => {
    it('prefers canonical requestTargets and falls back to the legacy alias', () => {
        const canonical: CompilePromptRequest = {
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            requestTargets: [{ performerId: 'peer-1', performerName: 'Peer One', description: 'Reviewer' }],
            relatedPerformers: [{ performerId: 'legacy-1', performerName: 'Legacy One', description: 'Legacy' }],
        }
        const legacyOnly: CompilePromptRequest = {
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            relatedPerformers: [{ performerId: 'legacy-1', performerName: 'Legacy One', description: 'Legacy' }],
        }

        expect(getCompileRequestTargets(canonical)).toEqual(canonical.requestTargets)
        expect(getCompileRequestTargets(legacyOnly)).toEqual(legacyOnly.relatedPerformers)
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
                collaborationPromptSection: '# Collaboration Context\n\n- Stay aligned with the workspace goal.',
                relationPromptSection: '# Available Agents\n\n- **Peer**: use `task` with agent="agent_peer"',
            },
            [],
        )

        const system = compiled.agentContents.build
        expect(system).toContain('# Collaboration Context')
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
