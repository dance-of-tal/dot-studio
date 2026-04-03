import { Hono } from 'hono'
import type { ActDefinition } from '../../shared/act-types.js'
import { getActRuntimeService } from '../services/act-runtime/act-runtime-service.js'
import { requestWorkingDir } from './route-errors.js'

const actRuntimeThreads = new Hono()

function validateActDefinition(def: ActDefinition | undefined) {
    if (!def) return null

    const participantKeys = Object.keys(def.participants || {})
    if (participantKeys.length === 0) {
        return 'Act must have at least one participant'
    }

    // Validate performerRef shape for each participant
    for (const [key, binding] of Object.entries(def.participants || {})) {
        const ref = binding?.performerRef
        if (!ref || !ref.kind) {
            return `Participant "${key}": performerRef is required with a valid kind`
        }
        const refKind = ref.kind as string
        if (refKind !== 'draft' && refKind !== 'registry') {
            return `Participant "${key}": performerRef.kind must be 'draft' or 'registry', got "${refKind}"`
        }
        if (ref.kind === 'draft' && !ref.draftId) {
            return `Participant "${key}": draft performerRef must include draftId`
        }
        if (ref.kind === 'registry' && !ref.urn) {
            return `Participant "${key}": registry performerRef must include urn`
        }
        // Validate subscription values if present
        const subs = binding?.subscriptions
        if (subs) {
            // messagesFrom: must be array of non-blank strings referencing existing participants
            if (subs.messagesFrom) {
                if (!Array.isArray(subs.messagesFrom)) {
                    return `Participant "${key}": subscriptions.messagesFrom must be an array`
                }
                for (const fromKey of subs.messagesFrom) {
                    if (typeof fromKey !== 'string' || !fromKey.trim()) {
                        return `Participant "${key}": subscriptions.messagesFrom contains a blank or non-string entry`
                    }
                    if (!participantKeys.includes(fromKey)) {
                        return `Participant "${key}": subscriptions.messagesFrom references unknown participant "${fromKey}"`
                    }
                }
            }
            // messageTags: must be array of non-blank strings
            if (subs.messageTags) {
                if (!Array.isArray(subs.messageTags)) {
                    return `Participant "${key}": subscriptions.messageTags must be an array`
                }
                for (const tag of subs.messageTags) {
                    if (typeof tag !== 'string' || !tag.trim()) {
                        return `Participant "${key}": subscriptions.messageTags contains a blank or non-string entry`
                    }
                }
            }
            // callboardKeys: must be array of non-blank strings
            if (subs.callboardKeys) {
                if (!Array.isArray(subs.callboardKeys)) {
                    return `Participant "${key}": subscriptions.callboardKeys must be an array`
                }
                for (const cbKey of subs.callboardKeys) {
                    if (typeof cbKey !== 'string' || !cbKey.trim()) {
                        return `Participant "${key}": subscriptions.callboardKeys contains a blank or non-string entry`
                    }
                }
            }
            // eventTypes: must be array with only known event types
            if (subs.eventTypes) {
                if (!Array.isArray(subs.eventTypes)) {
                    return `Participant "${key}": subscriptions.eventTypes must be an array`
                }
                const validEventTypes = ['runtime.idle']
                for (const et of subs.eventTypes) {
                    if (typeof et !== 'string' || !et.trim()) {
                        return `Participant "${key}": subscriptions.eventTypes contains a blank or non-string entry`
                    }
                    if (!validEventTypes.includes(et)) {
                        return `Participant "${key}": unknown event type "${et}" in subscriptions.eventTypes`
                    }
                }
            }
        }
    }

    const relations = def.relations || []
    if (participantKeys.length > 1 && relations.length === 0) {
        return 'Multiple participants require at least one relation'
    }

    for (const relation of relations) {
        for (const endpoint of relation.between) {
            if (!participantKeys.includes(endpoint)) {
                return `Relation "${relation.name}" references unknown participant "${endpoint}"`
            }
        }
        if (relation.direction !== 'both' && relation.direction !== 'one-way') {
            return `Relation "${relation.name || '?'}": direction must be 'both' or 'one-way'`
        }
        if (!relation.name || typeof relation.name !== 'string') {
            return 'Relation name is required and must be a non-empty string'
        }
        if (!relation.description || typeof relation.description !== 'string') {
            return `Relation "${relation.name}": description is required and must be a non-empty string`
        }
    }

    return null
}

actRuntimeThreads.post('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const body = await c.req.json<{ actDefinition?: ActDefinition }>().catch(() => ({ actDefinition: undefined }))
    const validationError = validateActDefinition(body.actDefinition)
    if (validationError) {
        return c.json({ ok: false, error: validationError }, 400)
    }

    return c.json(await getActRuntimeService(requestWorkingDir(c)).createThread(actId, body.actDefinition))
})

actRuntimeThreads.patch('/api/act/:actId/runtime-definition', async (c) => {
    const actId = c.req.param('actId')
    const body = await c.req.json<{ actDefinition?: ActDefinition }>().catch(() => ({ actDefinition: undefined }))
    const validationError = validateActDefinition(body.actDefinition)
    if (validationError || !body.actDefinition) {
        return c.json({ ok: false, error: validationError || 'actDefinition is required' }, 400)
    }

    return c.json(await getActRuntimeService(requestWorkingDir(c)).syncActDefinition(actId, body.actDefinition))
})

actRuntimeThreads.get('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    return c.json(await getActRuntimeService(requestWorkingDir(c)).listThreads(actId))
})

actRuntimeThreads.get('/api/act/:actId/thread/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const result = await getActRuntimeService(requestWorkingDir(c)).getThread(threadId)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeThreads.get('/api/act/:actId/thread/:threadId/events', async (c) => {
    const threadId = c.req.param('threadId')
    const parsedCount = parseInt(c.req.query('count') || '50', 10)
    const count = Number.isFinite(parsedCount) ? parsedCount : 50
    const before = Math.max(0, parseInt(c.req.query('before') || '0', 10) || 0)
    try {
        return c.json(await getActRuntimeService(requestWorkingDir(c)).getRecentEvents(threadId, count, before))
    } catch {
        // Thread may not exist after server restart — return empty events
        return c.json({ ok: true, events: [], total: 0, hasMore: false, nextBefore: 0 })
    }
})

actRuntimeThreads.delete('/api/act/:actId/thread/:threadId', async (c) => {
    const actId = c.req.param('actId')
    const threadId = c.req.param('threadId')
    const result = await getActRuntimeService(requestWorkingDir(c)).deleteThread(actId, threadId)
    if (!result.ok) {
        return c.json(result, 404)
    }
    return c.json(result)
})

export default actRuntimeThreads
