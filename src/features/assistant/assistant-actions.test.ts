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

    it('creates and updates an act from same-block performer refs', async () => {
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

    it('creates a dance draft and writes bundle files using same-block draft refs', async () => {
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
