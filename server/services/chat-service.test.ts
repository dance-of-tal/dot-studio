import { beforeEach, describe, expect, it, vi } from 'vitest'

const promptAsyncMock = vi.fn()
const ensurePerformerProjectionMock = vi.fn()
const parseActSessionOwnershipOwnerIdMock = vi.fn()
const getActDefinitionForThreadMock = vi.fn()
const getActRuntimeServiceMock = vi.fn()
const sessionHasUserMessagesMock = vi.fn()
const maybeGenerateStandaloneSessionTitleMock = vi.fn()
const maybeGenerateActThreadNameMock = vi.fn()
const resolveActSessionSettlementOutcomeMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
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
    maybeGenerateStandaloneSessionTitle: maybeGenerateStandaloneSessionTitleMock,
    maybeGenerateActThreadName: maybeGenerateActThreadNameMock,
}))

vi.mock('./act-runtime/act-session-settlement.js', () => ({
    formatActSessionError: vi.fn(() => 'Act session failed'),
    resolveActSessionSettlementOutcome: resolveActSessionSettlementOutcomeMock,
}))

describe('sendStudioChatMessage', () => {
    beforeEach(() => {
        promptAsyncMock.mockReset().mockResolvedValue({ data: undefined })
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
        maybeGenerateStandaloneSessionTitleMock.mockReset().mockResolvedValue(true)
        maybeGenerateActThreadNameMock.mockReset().mockResolvedValue(true)
        resolveActSessionSettlementOutcomeMock.mockReset().mockResolvedValue({ kind: 'settled' })
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

        expect(maybeGenerateStandaloneSessionTitleMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            sessionId: 'session-standalone',
            message: 'Design a roadmap for the release branch.',
            model: {
                providerID: 'openai',
                modelID: 'gpt-5',
            },
        })
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

        expect(maybeGenerateActThreadNameMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            actId: 'act-1',
            threadId: 'thread-1',
            message: 'Investigate the API regression and propose next steps.',
            model: {
                providerID: 'openai',
                modelID: 'gpt-5',
            },
        })
        expect(maybeGenerateStandaloneSessionTitleMock).not.toHaveBeenCalled()
    })
})
