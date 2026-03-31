import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: vi.fn().mockResolvedValue(null),
}))

vi.mock('../draft-service.js', () => ({
    readDraftTextContent: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/dot-source.js', () => ({
    getAssetPayload: vi.fn().mockResolvedValue(null),
}))

describe('compilePerformer scope boundaries', () => {
    it('explicitly disables act collaboration tools for workspace performers', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'solo-performer',
            performerName: 'Solo Performer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: [],
            toolMap: {
                read: true,
            },
            collaborationPromptSection: null,
            relationPromptSection: null,
        }, [])

        const buildContent = compiled.agentContents.build || ''
        expect(buildContent).toContain('"message_teammate": false')
        expect(buildContent).toContain('"update_shared_board": false')
        expect(buildContent).toContain('"read_shared_board": false')
        expect(buildContent).toContain('"wait_until": false')
    })

    it('keeps act collaboration tools enabled only for act scope when requested', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'participant-reviewer',
            performerName: 'Reviewer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'act',
            actId: 'act-review',
            skillNames: [],
            toolMap: {
                read: true,
                message_teammate: true,
                update_shared_board: true,
                read_shared_board: true,
                wait_until: true,
            },
            collaborationPromptSection: 'act-only context',
            relationPromptSection: null,
        }, [])

        const buildContent = compiled.agentContents.build || ''
        expect(buildContent).toContain('"message_teammate": true')
        expect(buildContent).toContain('"update_shared_board": true')
        expect(buildContent).toContain('"read_shared_board": true')
        expect(buildContent).toContain('"wait_until": true')
        expect(buildContent).toContain('act-only context')
    })
})
