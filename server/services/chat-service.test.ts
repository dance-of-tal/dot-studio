import { beforeEach, describe, expect, it, vi } from 'vitest'

const promptAsyncMock = vi.fn()
const disposeInstanceMock = vi.fn()
const ensurePerformerProjectionMock = vi.fn()
const parseActSessionOwnershipOwnerIdMock = vi.fn()
const getActDefinitionForThreadMock = vi.fn()
const getActRuntimeServiceMock = vi.fn()
const sessionHasUserMessagesMock = vi.fn()
const setInitialStandaloneSessionTitleMock = vi.fn()
const maybeGenerateStandaloneSessionTitleMock = vi.fn()
const setInitialActThreadNameMock = vi.fn()
const maybeGenerateActThreadNameMock = vi.fn()
const resolveActSessionSettlementOutcomeMock = vi.fn()
const prepareAssistantChatRequestMock = vi.fn()
const countRunningSessionsMock = vi.fn()
const publishProjectionConsumedMock = vi.fn()
const listWorkspacePerformersForDirMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: {
            dispose: disposeInstanceMock,
        },
        session: {
            promptAsync: promptAsyncMock,
        },
    }),
}))

vi.mock('./opencode-projection/stage-projection-service.js', () => ({
    ensurePerformerProjection: ensurePerformerProjectionMock,
}))

vi.mock('./session-ownership-service.js', () => ({
    createSessionOwnership: vi.fn(),
    parseActSessionOwnershipOwnerId: parseActSessionOwnershipOwnerIdMock,
    resolveSessionOwnership: vi.fn(),
}))

vi.mock('./act-runtime/act-runtime-service.js', () => ({
    getActDefinitionForThread: getActDefinitionForThreadMock,
    getActRuntimeService: getActRuntimeServiceMock,
}))

vi.mock('./thread-title-service.js', () => ({
    sessionHasUserMessages: sessionHasUserMessagesMock,
    setInitialStandaloneSessionTitle: setInitialStandaloneSessionTitleMock,
    maybeGenerateStandaloneSessionTitle: maybeGenerateStandaloneSessionTitleMock,
    setInitialActThreadName: setInitialActThreadNameMock,
    maybeGenerateActThreadName: maybeGenerateActThreadNameMock,
}))

vi.mock('./act-runtime/act-session-settlement.js', () => ({
    formatActSessionError: vi.fn(() => 'Act session failed'),
    resolveActSessionSettlementOutcome: resolveActSessionSettlementOutcomeMock,
}))

vi.mock('./studio-assistant/assistant-chat-service.js', () => ({
    prepareAssistantChatRequest: prepareAssistantChatRequestMock,
}))

vi.mock('./runtime-reload-service.js', () => ({
    countRunningSessions: countRunningSessionsMock,
}))

vi.mock('./runtime-execution-events.js', () => ({
    publishProjectionConsumed: publishProjectionConsumedMock,
}))

vi.mock('./workspace-service.js', () => ({
    listWorkspacePerformersForDir: listWorkspacePerformersForDirMock,
}))

describe('sendStudioChatMessage', () => {
    beforeEach(() => {
        promptAsyncMock.mockReset().mockResolvedValue({ data: undefined })
        disposeInstanceMock.mockReset().mockResolvedValue(undefined)
        parseActSessionOwnershipOwnerIdMock.mockReset().mockReturnValue(null)
        getActDefinitionForThreadMock.mockReset().mockResolvedValue(null)
        getActRuntimeServiceMock.mockReset().mockReturnValue({
            beginUserTurn: vi.fn().mockResolvedValue(undefined),
            markParticipantSessionBusy: vi.fn().mockResolvedValue(undefined),
            drainParticipantQueue: vi.fn().mockResolvedValue(undefined),
            tripParticipantAutoWakeCircuit: vi.fn().mockResolvedValue(undefined),
            clearParticipantAutoWakeCircuit: vi.fn().mockResolvedValue(undefined),
        })
        sessionHasUserMessagesMock.mockReset().mockResolvedValue(true)
        setInitialStandaloneSessionTitleMock.mockReset().mockResolvedValue(true)
        maybeGenerateStandaloneSessionTitleMock.mockReset().mockResolvedValue(true)
        setInitialActThreadNameMock.mockReset().mockResolvedValue(true)
        maybeGenerateActThreadNameMock.mockReset().mockResolvedValue(true)
        resolveActSessionSettlementOutcomeMock.mockReset().mockResolvedValue({ kind: 'settled' })
        countRunningSessionsMock.mockReset().mockResolvedValue({ runningSessions: 0 })
        publishProjectionConsumedMock.mockReset()
        listWorkspacePerformersForDirMock.mockReset().mockResolvedValue([])
        prepareAssistantChatRequestMock.mockReset().mockResolvedValue({
            assistantAgentName: 'dot-studio/studio-assistant',
            capabilitySnapshot: null,
            promptTools: {
                apply_studio_actions: true,
            },
            systemPrompt: 'Assistant system prompt',
        })
        ensurePerformerProjectionMock.mockReset().mockResolvedValue({
            compiled: {
                agentNames: {
                    build: 'dot-studio/workspace/hash/performer-1--build',
                },
            },
            toolResolution: {
                selectedMcpServers: ['playwright'],
                requestedTools: ['playwright_*'],
                availableTools: ['playwright_*'],
                resolvedTools: ['playwright_*'],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {
                'playwright_*': true,
            },
            capabilitySnapshot: null,
            changed: false,
        })
    })

    it('passes resolved MCP tools to the prompt request', async () => {
        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Use Playwright MCP if available.',
                performer: {
                    performerId: 'performer-1',
                    performerName: 'Performer',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'ollama-cloud',
                        modelId: 'gpt-oss:120b',
                    },
                    mcpServerNames: ['playwright'],
                },
            },
        )

        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-1',
            directory: '/tmp/workspace',
            agent: 'dot-studio/workspace/hash/performer-1--build',
            tools: {
                'playwright_*': true,
            },
        }))
    })

    it('publishes projection consumption after a successful execution-boundary dispose', async () => {
        ensurePerformerProjectionMock.mockResolvedValueOnce({
            compiled: {
                agentNames: {
                    build: 'dot-studio/workspace/hash/performer-1--build',
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
            changed: true,
        })

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Run with the latest projection.',
                performer: {
                    performerId: 'performer-1',
                    performerName: 'Performer',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                    mcpServerNames: [],
                },
            },
        )

        expect(publishProjectionConsumedMock).toHaveBeenCalledWith('/tmp/workspace', {
            performerIds: ['performer-1'],
        })
    })

    it('adopts the hinted dirty standalone projection scope in one execution boundary', async () => {
        listWorkspacePerformersForDirMock.mockResolvedValue([
            {
                id: 'performer-1',
                name: 'Performer 1',
                model: { provider: 'openai', modelId: 'gpt-5' },
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            },
            {
                id: 'performer-2',
                name: 'Performer 2',
                model: { provider: 'openai', modelId: 'gpt-5' },
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            },
        ])
        ensurePerformerProjectionMock.mockImplementation(async ({ performerId }: { performerId: string }) => ({
            compiled: {
                agentNames: {
                    build: `dot-studio/workspace/hash/${performerId}--build`,
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
            changed: performerId === 'performer-2',
        }))

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Run with the latest projection.',
                projectionScope: {
                    performerIds: ['performer-2'],
                },
                performer: {
                    performerId: 'performer-1',
                    performerName: 'Performer 1',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                    mcpServerNames: [],
                },
            },
        )

        expect(ensurePerformerProjectionMock).toHaveBeenCalledTimes(2)
        expect(ensurePerformerProjectionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
            performerId: 'performer-1',
        }))
        expect(ensurePerformerProjectionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            performerId: 'performer-2',
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            agent: 'dot-studio/workspace/hash/performer-1--build',
        }))
        expect(publishProjectionConsumedMock).toHaveBeenCalledWith('/tmp/workspace', {
            performerIds: ['performer-1', 'performer-2'],
        })
    })

    it('starts standalone title generation on the first user message', async () => {
        sessionHasUserMessagesMock.mockResolvedValue(false)

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-standalone',
            {
                message: 'Design a roadmap for the release branch.',
                performer: {
                    performerId: 'performer-1',
                    performerName: 'Planner',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
            },
        )

        expect(setInitialStandaloneSessionTitleMock).toHaveBeenCalledWith({
            sessionId: 'session-standalone',
            provisionalTitle: 'Design a roadmap for the release branch.',
        })
        expect(maybeGenerateStandaloneSessionTitleMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            sessionId: 'session-standalone',
            message: 'Design a roadmap for the release branch.',
            model: {
                providerID: 'openai',
                modelID: 'gpt-5',
            },
            provisionalTitle: 'Design a roadmap for the release branch.',
        })
        expect(setInitialActThreadNameMock).not.toHaveBeenCalled()
        expect(maybeGenerateActThreadNameMock).not.toHaveBeenCalled()
    })

    it('starts Act thread naming from the first user message without renaming the participant session', async () => {
        sessionHasUserMessagesMock.mockResolvedValue(false)
        parseActSessionOwnershipOwnerIdMock.mockReturnValue({
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-act',
            {
                message: 'Investigate the API regression and propose next steps.',
                performer: {
                    performerId: 'act:act-1:thread:thread-1:participant:Lead',
                    performerName: 'Lead',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
                actId: 'act-1',
                actThreadId: 'thread-1',
            },
        )

        expect(setInitialActThreadNameMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            actId: 'act-1',
            threadId: 'thread-1',
            provisionalTitle: 'Investigate the API regression and propose next steps.',
        })
        expect(maybeGenerateActThreadNameMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            actId: 'act-1',
            threadId: 'thread-1',
            message: 'Investigate the API regression and propose next steps.',
            model: {
                providerID: 'openai',
                modelID: 'gpt-5',
            },
            provisionalTitle: 'Investigate the API regression and propose next steps.',
        })
        expect(setInitialStandaloneSessionTitleMock).not.toHaveBeenCalled()
        expect(maybeGenerateStandaloneSessionTitleMock).not.toHaveBeenCalled()
    })

    it('injects Act collaboration context into a turn-scoped system prompt instead of the projected agent file', async () => {
        parseActSessionOwnershipOwnerIdMock.mockReturnValue({
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        getActDefinitionForThreadMock.mockResolvedValue({
            id: 'act-1',
            name: 'Review Team',
            participants: {
                Lead: { performerRef: { kind: 'draft', draftId: 'lead' } },
                Researcher: { performerRef: { kind: 'draft', draftId: 'researcher' } },
            },
            relations: [{
                id: 'rel-1',
                between: ['Lead', 'Researcher'],
                direction: 'both',
                name: 'Review Loop',
            }],
        })

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-act',
            {
                message: 'Please review the latest findings.',
                performer: {
                    performerId: 'act:act-1:thread:thread-1:participant:Lead',
                    performerName: 'Lead',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
                actId: 'act-1',
                actThreadId: 'thread-1',
            },
        )

        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('# Collaboration Context'),
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            parts: [{
                type: 'text',
                text: 'Please review the latest findings.',
            }],
        }))
    })

    it('keeps assistant system context out of the user text payload', async () => {
        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-assistant',
            {
                message: 'Create a new performer.',
                performer: {
                    performerId: 'studio-assistant',
                    performerName: 'Studio Assistant',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
            },
        )

        expect(prepareAssistantChatRequestMock).toHaveBeenCalledWith('/tmp/workspace', expect.objectContaining({
            message: 'Create a new performer.',
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            agent: 'dot-studio/studio-assistant',
            system: 'Assistant system prompt',
            parts: [{
                type: 'text',
                text: 'Create a new performer.',
            }],
        }))
    })

    it('disposes and retries once when OpenCode reports an act agent registry miss', async () => {
        parseActSessionOwnershipOwnerIdMock.mockReturnValue({
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        ensurePerformerProjectionMock.mockResolvedValue({
            compiled: {
                agentNames: {
                    build: 'dot-studio/act/hash/participant-lead--build',
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
        })
        promptAsyncMock
            .mockRejectedValueOnce(new Error('Agent not found: "dot-studio/act/hash/participant-lead--build". Available agents: build'))
            .mockResolvedValueOnce({ data: undefined })

        const { sendStudioChatMessage } = await import('./chat-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-act',
            {
                message: 'Please continue the handoff.',
                performer: {
                    performerId: 'act:act-1:thread:thread-1:participant:Lead',
                    performerName: 'Lead',
                    talRef: null,
                    danceRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5.4',
                    },
                },
                actId: 'act-1',
                actThreadId: 'thread-1',
            },
        )

        expect(disposeInstanceMock).toHaveBeenCalledTimes(1)
        expect(disposeInstanceMock).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
        expect(promptAsyncMock).toHaveBeenCalledTimes(2)
        expect(promptAsyncMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
            agent: 'dot-studio/act/hash/participant-lead--build',
        }))
        expect(promptAsyncMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            agent: 'dot-studio/act/hash/participant-lead--build',
        }))
    })
})
