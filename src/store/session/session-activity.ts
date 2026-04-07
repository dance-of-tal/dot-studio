import type { PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import type { ChatMessage } from '../../types'
import type { SessionStatus } from './types'

export type SessionActivityKind = 'idle' | 'optimistic' | 'running' | 'interactive' | 'parked'

export type SessionActivity = {
    kind: SessionActivityKind
    isActive: boolean
    canAbort: boolean
    isTransportActive: boolean
}

function getLastNonSystemMessage(messages: ChatMessage[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message.role !== 'system') {
            return message
        }
    }

    return null
}

function hasSettledAssistantSnapshot(messages: ChatMessage[]) {
    const lastMessage = getLastNonSystemMessage(messages)
    if (!lastMessage || lastMessage.role !== 'assistant') {
        return false
    }

    const parts = lastMessage.parts || []
    const tools = parts
        .filter((part) => part.type === 'tool' && !!part.tool)
        .map((part) => part.tool!)

    if (tools.some((tool) => tool.status === 'pending' || tool.status === 'running')) {
        return false
    }

    if (parts.some((part) => part.type === 'step-finish')) {
        return true
    }

    return tools.length > 0 && tools.some((tool) => tool.status === 'completed' || tool.status === 'error')
}

export function isSessionParkedByWaitUntil(messages: ChatMessage[]) {
    const lastMessage = getLastNonSystemMessage(messages)
    if (!lastMessage || lastMessage.role !== 'assistant') {
        return false
    }

    const tools = (lastMessage.parts || [])
        .filter((part) => part.type === 'tool' && !!part.tool)
        .map((part) => part.tool!)
    if (tools.length === 0) {
        return false
    }

    if (tools.some((tool) => tool.status === 'pending' || tool.status === 'running')) {
        return false
    }

    const lastTool = tools[tools.length - 1]
    return lastTool?.name === 'wait_until' && lastTool.status === 'completed'
}

function isOptimisticSessionBridge(params: {
    loading: boolean
    status: SessionStatus | null | undefined
}) {
    return params.loading && !params.status
}

export function resolveSessionActivity(params: {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
}) {
    const { loading, status, messages, permission, question } = params

    if (permission || question) {
        return {
            kind: 'interactive',
            isActive: false,
            canAbort: false,
            isTransportActive: false,
        } satisfies SessionActivity
    }

    if (isSessionParkedByWaitUntil(messages)) {
        return {
            kind: 'parked',
            isActive: false,
            canAbort: false,
            isTransportActive: false,
        } satisfies SessionActivity
    }

    if (status?.type === 'busy' || status?.type === 'retry') {
        return {
            kind: 'running',
            isActive: true,
            canAbort: true,
            isTransportActive: true,
        } satisfies SessionActivity
    }

    if (isOptimisticSessionBridge({ loading, status }) && hasSettledAssistantSnapshot(messages)) {
        return {
            kind: 'idle',
            isActive: false,
            canAbort: false,
            isTransportActive: false,
        } satisfies SessionActivity
    }

    if (isOptimisticSessionBridge({ loading, status })) {
        return {
            kind: 'optimistic',
            isActive: true,
            canAbort: true,
            isTransportActive: true,
        } satisfies SessionActivity
    }

    return {
        kind: 'idle',
        isActive: false,
        canAbort: false,
        isTransportActive: false,
    } satisfies SessionActivity
}

export function isSessionExecutionActive(params: {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
}) {
    return resolveSessionActivity(params).isActive
}

export function canAbortSessionExecution(params: {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
}) {
    return resolveSessionActivity(params).canAbort
}

export function isSessionTransportActive(params: {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
}) {
    return resolveSessionActivity(params).isTransportActive
}
