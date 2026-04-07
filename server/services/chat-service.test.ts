import { beforeEach, describe, expect, it, vi } from 'vitest'

const promptAsyncMock = vi.fn()
const ensurePerformerProjectionMock = vi.fn()

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
    parseActSessionOwnershipOwnerId: vi.fn(),
    resolveSessionOwnership: vi.fn(),
}))

vi.mock('./act-runtime/act-runtime-service.js', () => ({
    getActDefinitionForThread: vi.fn(),
    getActRuntimeService: vi.fn(),
}))

describe('sendStudioChatMessage', () => {
    beforeEach(() => {
        promptAsyncMock.mockReset().mockResolvedValue({ data: undefined })
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
})
