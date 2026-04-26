import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createPerformerNode } from '../../lib/performers-node'

let useStudioStore: typeof import('../../store').useStudioStore
let applyAssistantAction: typeof import('./assistant-actions').applyAssistantAction
let applyAssistantActions: typeof import('./assistant-actions').applyAssistantActions

const listAssetsMock = vi.fn().mockResolvedValue([])
const createDraftMock = vi.fn()
const updateDraftMock = vi.fn()
const deleteDraftMock = vi.fn()
const writeDanceBundleFileMock = vi.fn()
const deleteDanceBundleFileMock = vi.fn()
const deleteActRuntimeMock = vi.fn().mockResolvedValue({ ok: true })

function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
) {
    return !(
        left.x + left.width <= right.x
        || right.x + right.width <= left.x
        || left.y + left.height <= right.y
        || right.y + right.height <= left.y
    )
}

vi.mock('../../api', () => ({
    api: {
        assets: {
            list: listAssetsMock,
        },
        drafts: {
            create: createDraftMock,
            update: updateDraftMock,
            delete: deleteDraftMock,
            danceBundle: {
                writeFile: writeDanceBundleFileMock,
                deleteFile: deleteDanceBundleFileMock,
            },
        },
        dot: {
            install: vi.fn(),
            addFromGitHub: vi.fn(),
        },
        actRuntime: {
            deleteAct: deleteActRuntimeMock,
        },
    },
}))

beforeAll(async () => {
    vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
    })

    ;({ useStudioStore } = await import('../../store'))
    ;({ applyAssistantAction } = await import('./assistant-actions'))
    ;({ applyAssistantActions } = await import('./assistant-actions'))
})

afterEach(() => {
    listAssetsMock.mockClear()
    createDraftMock.mockReset()
    updateDraftMock.mockReset()
    deleteDraftMock.mockReset()
    writeDanceBundleFileMock.mockReset()
    deleteDanceBundleFileMock.mockReset()
    deleteActRuntimeMock.mockReset().mockResolvedValue({ ok: true })
    useStudioStore.setState({
        performers: [],
        acts: [],
        drafts: {},
        actThreads: {},
        workspaceDirty: false,
        workingDir: '',
        selectedActId: null,
        selectedPerformerId: null,
        actEditorState: null,
        activeThreadId: null,
        activeThreadParticipantKey: null,
    })
})

describe('assistant-actions', () => {
    it('creates, updates, and deletes a tal draft through draft CRUD actions', async () => {
        createDraftMock.mockResolvedValue({
            id: 'tal-draft-1',
            kind: 'tal',
            name: 'Reviewer Tal',
            content: '# Role',
            updatedAt: Date.now(),
        })
        updateDraftMock.mockResolvedValue({
            id: 'tal-draft-1',
            kind: 'tal',
            name: 'Senior Reviewer Tal',
            content: '# Updated Role',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'createTalDraft',
                ref: 'reviewer-tal',
                name: 'Reviewer Tal',
                content: '# Role',
            },
            {
                type: 'updateTalDraft',
                draftRef: 'reviewer-tal',
                name: 'Senior Reviewer Tal',
                content: '# Updated Role',
            },
            {
                type: 'deleteTalDraft',
                draftRef: 'reviewer-tal',
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })
        expect(updateDraftMock).toHaveBeenCalledWith('tal', 'tal-draft-1', {
            name: 'Senior Reviewer Tal',
            content: '# Updated Role',
        })
        expect(deleteDraftMock).toHaveBeenCalledWith('tal', 'tal-draft-1')
        expect(useStudioStore.getState().drafts).toEqual({})
    })

    it('updates and deletes a saved dance draft through draft CRUD actions', async () => {
        useStudioStore.setState({
            drafts: {
                'dance-draft-1': {
                    id: 'dance-draft-1',
                    kind: 'dance',
                    name: 'Review Skill',
                    content: '---\nname: review-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
            },
        })
        updateDraftMock.mockResolvedValue({
            id: 'dance-draft-1',
            kind: 'dance',
            name: 'Updated Review Skill',
            content: '---\nname: updated-review-skill\n---',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'updateDanceDraft',
                draftId: 'dance-draft-1',
                name: 'Updated Review Skill',
                content: '---\nname: updated-review-skill\n---',
            },
            {
                type: 'deleteDanceDraft',
                draftId: 'dance-draft-1',
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 0 })
        expect(updateDraftMock).toHaveBeenCalledWith('dance', 'dance-draft-1', {
            name: 'Updated Review Skill',
            content: '---\nname: updated-review-skill\n---',
        })
        expect(deleteDraftMock).toHaveBeenCalledWith('dance', 'dance-draft-1')
        expect(useStudioStore.getState().drafts).toEqual({})
    })

    it('updates participant subscriptions using performer-name locators', async () => {
        useStudioStore.setState({
            performers: [
                createPerformerNode({
                    id: 'performer-researcher',
                    name: 'Researcher',
                    x: 0,
                    y: 0,
                }),
                createPerformerNode({
                    id: 'performer-writer',
                    name: 'Writer',
                    x: 0,
                    y: 0,
                }),
            ],
            acts: [
                {
                    id: 'act-1',
                    name: 'Research Flow',
                    position: { x: 0, y: 0 },
                    width: 400,
                    height: 300,
                    createdAt: Date.now(),
                    participants: {
                        'participant-researcher': {
                            performerRef: { kind: 'draft', draftId: 'performer-researcher' },
                            position: { x: 0, y: 0 },
                        },
                        'participant-writer': {
                            performerRef: { kind: 'draft', draftId: 'performer-writer' },
                            position: { x: 100, y: 0 },
                        },
                    },
                    relations: [],
                },
            ],
            actThreads: {},
        })

        const result = await applyAssistantAction({
            type: 'updateParticipantSubscriptions',
            actId: 'act-1',
            performerName: 'Writer',
            subscriptions: {
                messagesFromPerformerNames: ['Researcher'],
                messageTags: ['handoff'],
                callboardKeys: ['brief'],
                eventTypes: ['runtime.idle'],
            },
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().acts[0].participants['participant-writer'].subscriptions).toEqual({
            messagesFrom: ['participant-researcher'],
            messageTags: ['handoff'],
            callboardKeys: ['brief'],
            eventTypes: ['runtime.idle'],
        })
    })

    it('creates and updates a performer through Stage CRUD actions', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createPerformer',
                ref: 'writer',
                name: 'Writer',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                modelVariant: 'reasoning-high',
            },
            {
                type: 'updatePerformer',
                performerRef: 'writer',
                name: 'Senior Writer',
                model: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
                modelVariant: 'thinking-deep',
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 0 })

        const performer = useStudioStore.getState().performers[0]
        expect(performer?.name).toBe('Senior Writer')
        expect(performer?.model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4' })
        expect(performer?.modelVariant).toBe('thinking-deep')
    })

    it('deletes a performer and removes attached act bindings', async () => {
        const performerId = useStudioStore.getState().addPerformer('Reviewer')
        const actId = useStudioStore.getState().addAct('Code Review')
        const participantKey = useStudioStore.getState().attachPerformerToAct(actId, performerId)

        expect(participantKey).toBeTruthy()

        const result = await applyAssistantAction({
            type: 'deletePerformer',
            performerId,
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().performers).toHaveLength(0)
        expect(useStudioStore.getState().acts[0]?.participants).toEqual({})
    })

    it('fails cleanly when performer or act CRUD targets do not exist', async () => {
        const performerResult = await applyAssistantAction({
            type: 'updatePerformer',
            performerName: 'Missing Performer',
            name: 'Still Missing',
        })
        const actResult = await applyAssistantAction({
            type: 'deleteAct',
            actName: 'Missing Act',
        })

        expect(performerResult.success).toBe(false)
        expect(actResult.success).toBe(false)
    })

    it('creates and updates an act from same-call performer refs', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createPerformer',
                ref: 'dev',
                name: 'Developer',
            },
            {
                type: 'createPerformer',
                ref: 'rev',
                name: 'Reviewer',
            },
            {
                type: 'createAct',
                ref: 'review-act',
                name: 'Code Review',
                description: 'Initial review flow.',
                participantPerformerRefs: ['dev', 'rev'],
                relations: [
                    {
                        sourcePerformerRef: 'dev',
                        targetPerformerRef: 'rev',
                        direction: 'one-way',
                        name: 'request review',
                        description: 'Developer sends work to Reviewer.',
                    },
                ],
            },
            {
                type: 'updateAct',
                actRef: 'review-act',
                description: 'Updated review flow.',
                actRules: ['Escalate blockers quickly.'],
            },
        ])

        expect(result).toEqual({ applied: 4, failed: 0 })

        const act = useStudioStore.getState().acts[0]
        expect(act?.name).toBe('Code Review')
        expect(act?.description).toBe('Updated review flow.')
        expect(act?.actRules).toEqual(['Escalate blockers quickly.'])
        expect(Object.keys(act?.participants || {})).toHaveLength(2)
        expect(act?.relations).toHaveLength(1)
        expect(act?.relations[0]).toMatchObject({
            direction: 'one-way',
            name: 'request review',
            description: 'Developer sends work to Reviewer.',
        })

        const performers = useStudioStore.getState().performers.map((performer) => ({
            x: performer.position.x,
            y: performer.position.y,
            width: performer.width || 320,
            height: performer.height || 400,
        }))
        const actRect = {
            x: act!.position.x,
            y: act!.position.y,
            width: act!.width,
            height: act!.height,
        }

        expect(performers.every((performer) => performer.y < actRect.y)).toBe(true)
        expect(overlaps(performers[0], performers[1])).toBe(false)
        expect(performers.every((performer) => overlaps(performer, actRect) === false)).toBe(true)
        expect(useStudioStore.getState().canvasRevealTarget).toMatchObject({
            id: act!.id,
            type: 'act',
        })
    })

    it('applies performer descriptions and act safety settings', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createPerformer',
                ref: 'macro_analyst',
                name: 'Macro Analyst',
                description: 'Tracks regime changes and hands off evidence-backed context.',
            },
            {
                type: 'createPerformer',
                ref: 'equity_researcher',
                name: 'Equity Researcher',
            },
            {
                type: 'createAct',
                name: 'Investment Analyst Team',
                safety: {
                    threadTimeoutMs: 600000,
                    loopDetectionThreshold: 3,
                },
                participantPerformerRefs: ['macro_analyst', 'equity_researcher'],
                relations: [
                    {
                        sourcePerformerRef: 'macro_analyst',
                        targetPerformerRef: 'equity_researcher',
                        direction: 'one-way',
                        name: 'macro handoff',
                        description: 'Macro Analyst hands regime context to Equity Researcher.',
                    },
                ],
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })

        const act = useStudioStore.getState().acts[0]
        const performer = useStudioStore.getState().performers.find((entry) => entry.name === 'Macro Analyst')
        expect(performer?.meta?.authoring?.description).toBe('Tracks regime changes and hands off evidence-backed context.')
        expect(act?.name).toBe('Investment Analyst Team')
        expect(act?.safety).toEqual({
            threadTimeoutMs: 600000,
            loopDetectionThreshold: 3,
        })
        expect(Object.keys(act?.participants || {})).toHaveLength(2)
        expect(act?.relations).toHaveLength(1)
        expect(act?.relations[0]).toMatchObject({
            direction: 'one-way',
            name: 'macro handoff',
            description: 'Macro Analyst hands regime context to Equity Researcher.',
        })
    })

    it('fails to create a relation when name or description is missing', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createPerformer',
                ref: 'macro_analyst',
                name: 'Macro Analyst',
            },
            {
                type: 'createPerformer',
                ref: 'equity_researcher',
                name: 'Equity Researcher',
            },
            {
                type: 'createAct',
                name: 'Investment Analyst Team',
                participantPerformerRefs: ['macro_analyst', 'equity_researcher'],
                relations: [
                    {
                        sourcePerformerRef: 'macro_analyst',
                        targetPerformerRef: 'equity_researcher',
                        direction: 'one-way',
                        name: 'macro handoff',
                        description: '',
                    },
                ],
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 1 })

        expect(useStudioStore.getState().acts).toHaveLength(0)
    })

    it('deletes an act by name', async () => {
        useStudioStore.getState().addAct('Code Review')

        const result = await applyAssistantAction({
            type: 'deleteAct',
            actName: 'Code Review',
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().acts).toHaveLength(0)
    })

    it('creates a dance draft and writes bundle files using same-call draft refs', async () => {
        createDraftMock.mockResolvedValue({
            id: 'dance-draft-1',
            kind: 'dance',
            name: 'Review Skill',
            content: '---\nname: review-skill\n---',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'createDanceDraft',
                ref: 'skill',
                name: 'Review Skill',
                content: '---\nname: review-skill\n---',
            },
            {
                type: 'upsertDanceBundleFile',
                draftRef: 'skill',
                path: 'references/checklist.md',
                content: '# Checklist',
            },
            {
                type: 'upsertDanceBundleFile',
                draftRef: 'skill',
                path: 'agents/openai.yaml',
                content: 'display_name: Review Skill',
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })
        expect(writeDanceBundleFileMock).toHaveBeenNthCalledWith(1, 'dance-draft-1', 'references/checklist.md', '# Checklist')
        expect(writeDanceBundleFileMock).toHaveBeenNthCalledWith(2, 'dance-draft-1', 'agents/openai.yaml', 'display_name: Review Skill')
    })

    it('deletes dance bundle entries for saved drafts', async () => {
        useStudioStore.setState({
            drafts: {
                'dance-draft-1': {
                    id: 'dance-draft-1',
                    kind: 'dance',
                    name: 'Review Skill',
                    content: '---\nname: review-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
            },
        })

        const result = await applyAssistantAction({
            type: 'deleteDanceBundleEntry',
            draftId: 'dance-draft-1',
            path: 'scripts\\old-helper.sh',
        })

        expect(result.success).toBe(true)
        expect(deleteDanceBundleFileMock).toHaveBeenCalledWith('dance-draft-1', 'scripts/old-helper.sh')
    })

    it('fails cleanly for unsaved dance drafts before calling bundle APIs', async () => {
        useStudioStore.setState({
            drafts: {
                'dance-draft-1': {
                    id: 'dance-draft-1',
                    kind: 'dance',
                    name: 'Unsaved Skill',
                    content: '---\nname: unsaved-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
            },
        })

        const result = await applyAssistantAction({
            type: 'upsertDanceBundleFile',
            draftId: 'dance-draft-1',
            path: 'references/checklist.md',
            content: '# Checklist',
        })

        expect(result.success).toBe(false)
        expect(writeDanceBundleFileMock).not.toHaveBeenCalled()
    })
})
