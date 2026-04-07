import { Hono } from 'hono'
import type { ActDefinition } from '../../shared/act-types.js'
import type { ConditionExpr } from '../../shared/act-types.js'
import { resolveActSessionTarget } from '../services/act-runtime/act-session-runtime.js'
import { getActDefinitionForThread, getActRuntimeService } from '../services/act-runtime/act-runtime-service.js'
import { serverDebug } from '../lib/server-logger.js'
import { requestWorkingDir } from './route-errors.js'

const actRuntimeTools = new Hono()

export function resolveParticipantRecipient(
    actDefinition: ActDefinition | null | undefined,
    senderKey: string,
    recipient: string,
) {
    const canMessageParticipant = (participantKey: string) => {
        if (!actDefinition) {
            return true
        }

        return Object.values(actDefinition.relations || []).some((relation) => {
            const [left, right] = relation.between
            if (relation.direction === 'one-way') {
                return left === senderKey && right === participantKey
            }
            return (
                (left === senderKey && right === participantKey)
                || (left === participantKey && right === senderKey)
            )
        })
    }

    const normalizedRecipient = recipient.trim().toLowerCase()
    if (!normalizedRecipient) {
        return null
    }

    if (!actDefinition) {
        return recipient
    }

    for (const [participantKey, binding] of Object.entries(actDefinition.participants || {})) {
        const displayName = (binding.displayName || participantKey).trim().toLowerCase()
        if (
            canMessageParticipant(participantKey)
            && (displayName === normalizedRecipient || participantKey.toLowerCase() === normalizedRecipient)
        ) {
            return participantKey
        }
    }

    for (const relation of actDefinition.relations || []) {
        if (!relation.between.includes(senderKey)) {
            continue
        }
        const recipientKey = relation.between[0] === senderKey ? relation.between[1] : relation.between[0]
        if (!canMessageParticipant(recipientKey)) {
            continue
        }
        if (relation.name.trim().toLowerCase() !== normalizedRecipient) {
            continue
        }
        return recipientKey
    }

    return null
}

async function resolveParticipantKeyByName(
    workingDir: string,
    threadId: string,
    senderKey: string,
    recipient: string,
) {
    const actDefinition = await getActDefinitionForThread(workingDir, threadId)
    return resolveParticipantRecipient(actDefinition, senderKey, recipient)
}

actRuntimeTools.use('/api/act/*', async (c, next) => {
    const url = c.req.url
    const method = c.req.method
    const workingDir = c.req.query('workingDir') || c.req.header('x-dot-working-dir') || 'NONE'
    serverDebug('act-tool-req', `${method} ${url.replace(/\?.*/, '')} workingDir=${decodeURIComponent(workingDir).slice(-40)}`)
    await next()
})

actRuntimeTools.post('/api/act/:actId/thread/:threadId/send-message', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('act-tool', `send-message threadId=${threadId} workingDir=${workingDir}`)
    const body = await c.req.json<{
        from: string
        to: string
        content: string
        tag?: string
    }>()

    const service = getActRuntimeService(workingDir)
    const result = await service.sendMessage(threadId, body)
    serverDebug('act-tool', `send-message result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return c.json(result, result.status as 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.get('/api/act/session/:sessionId/read-shared-board', async (c) => {
    const target = await resolveActSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return c.json({ ok: false, error: 'Act session not found' }, 404)
    }

    const key = c.req.query('key')
    const summaryOnly = c.req.query('summaryOnly') !== 'false'
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
    const result = await getActRuntimeService(target.workingDir).readBoard(target.threadId, { key, summaryOnly, limit })
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/session/:sessionId/message-teammate', async (c) => {
    const target = await resolveActSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return c.json({ ok: false, error: 'Act session not found' }, 404)
    }

    const body = await c.req.json<{
        recipient: string
        message: string
        tag?: string
    }>()

    const recipientKey = await resolveParticipantKeyByName(
        target.workingDir,
        target.threadId,
        target.participantKey,
        body.recipient,
    )
    if (!recipientKey) {
        return c.json({ ok: false, error: `Unknown teammate "${body.recipient}"` }, 400)
    }

    const result = await getActRuntimeService(target.workingDir).sendMessage(target.threadId, {
        from: target.participantKey,
        to: recipientKey,
        content: body.message,
        tag: body.tag,
    })
    if (!result.ok) {
        return c.json(result, result.status as 400 | 403 | 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/:actId/thread/:threadId/post-to-board', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('act-tool', `post-to-board threadId=${threadId} workingDir=${workingDir}`)
    const body = await c.req.json<{
        author: string
        key: string
        kind: 'artifact' | 'finding' | 'task'
        content: string
        updateMode?: 'replace' | 'append'
        metadata?: Record<string, unknown>
    }>()

    const result = await getActRuntimeService(workingDir).postToBoard(threadId, body)
    serverDebug('act-tool', `post-to-board result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return c.json(result, result.status as 400 | 403 | 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/session/:sessionId/update-shared-board', async (c) => {
    const target = await resolveActSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return c.json({ ok: false, error: 'Act session not found' }, 404)
    }

    const body = await c.req.json<{
        entryKey: string
        entryType: 'artifact' | 'finding' | 'task'
        content: string
        mode?: 'replace' | 'append'
    }>()

    const result = await getActRuntimeService(target.workingDir).postToBoard(target.threadId, {
        author: target.participantKey,
        key: body.entryKey,
        kind: body.entryType,
        content: body.content,
        updateMode: body.mode,
    })
    if (!result.ok) {
        return c.json(result, result.status as 400 | 403 | 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.get('/api/act/:actId/thread/:threadId/read-board', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('act-tool', `read-board threadId=${threadId} workingDir=${workingDir}`)
    const key = c.req.query('key')
    const summaryOnly = c.req.query('summaryOnly') !== 'false'
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
    const result = await getActRuntimeService(workingDir).readBoard(threadId, { key, summaryOnly, limit })
    serverDebug('act-tool', `read-board result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/:actId/thread/:threadId/set-wake-condition', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        createdBy: string
        target: 'self'
        onSatisfiedMessage: string
        condition: ConditionExpr
    }>()

    const result = await getActRuntimeService(requestWorkingDir(c)).setWakeCondition(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/session/:sessionId/wait-until', async (c) => {
    const target = await resolveActSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return c.json({ ok: false, error: 'Act session not found' }, 404)
    }

    const body = await c.req.json<{
        resumeWith: string
        condition: ConditionExpr
    }>()

    const result = await getActRuntimeService(target.workingDir).setWakeCondition(target.threadId, {
        createdBy: target.participantKey,
        target: 'self',
        onSatisfiedMessage: body.resumeWith,
        condition: body.condition,
    })
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

export default actRuntimeTools
