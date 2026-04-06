import { describe, it, expect } from 'vitest'
import { evaluateActReadiness } from './act-readiness'
import type { WorkspaceAct, PerformerNode } from '../../types'

function makePerformer(overrides: Partial<PerformerNode> = {}): PerformerNode {
    return {
        id: 'p1',
        name: 'Test Performer',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: { provider: 'openai', modelId: 'gpt-4o' },
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        ...overrides,
    }
}

function makeAct(overrides: Partial<WorkspaceAct> = {}): WorkspaceAct {
    return {
        id: 'act-1',
        name: 'Test Act',
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        participants: {},
        relations: [],
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('evaluateActReadiness', () => {
    it('returns error when there are no participants', () => {
        const result = evaluateActReadiness(makeAct(), [])
        expect(result.runnable).toBe(false)
        expect(result.issues).toHaveLength(1)
        expect(result.issues[0].code).toBe('no-participants')
        expect(result.issues[0].severity).toBe('error')
    })

    it('returns runnable for single participant with model', () => {
        const performer = makePerformer({ id: 'p1' })
        const act = makeAct({
            participants: {
                'agent-a': {
                    performerRef: { kind: 'draft', draftId: 'p1' },
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateActReadiness(act, [performer])
        expect(result.runnable).toBe(true)
        expect(result.issues).toHaveLength(0)
    })

    it('returns error when multiple participants have no relations', () => {
        const p1 = makePerformer({ id: 'p1' })
        const p2 = makePerformer({ id: 'p2', name: 'Second' })
        const act = makeAct({
            participants: {
                'agent-a': { performerRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { performerRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
            },
        })
        const result = evaluateActReadiness(act, [p1, p2])
        expect(result.runnable).toBe(false)
        const noRelations = result.issues.find((i) => i.code === 'no-relations')
        expect(noRelations).toBeDefined()
        expect(noRelations!.severity).toBe('error')
    })

    it('returns error when relation references unknown participant key', () => {
        const performer = makePerformer({ id: 'p1' })
        const act = makeAct({
            participants: {
                'agent-a': { performerRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'ghost'] as [string, string],
                direction: 'both',
                name: 'test',
                description: 'test relation',
            }],
        })
        const result = evaluateActReadiness(act, [performer])
        expect(result.runnable).toBe(false)
        expect(result.issues.some((i) => i.code === 'unknown-relation-endpoint')).toBe(true)
    })

    it('returns error when performer ref cannot resolve', () => {
        const act = makeAct({
            participants: {
                'agent-a': { performerRef: { kind: 'draft', draftId: 'missing' }, position: { x: 0, y: 0 } },
            },
        })
        const result = evaluateActReadiness(act, [])
        expect(result.runnable).toBe(false)
        expect(result.issues.some((i) => i.code === 'unresolved-performer')).toBe(true)
    })

    it('returns error when performer has no model configured', () => {
        const performer = makePerformer({ id: 'p1', model: null })
        const act = makeAct({
            participants: {
                'agent-a': {
                    performerRef: { kind: 'draft', draftId: 'p1' },
                    displayName: 'CEO',
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateActReadiness(act, [performer])
        expect(result.runnable).toBe(false)
        const issue = result.issues.find((i) => i.code === 'no-model-config')
        expect(issue).toBeDefined()
        expect(issue?.message).toBe('Participant "CEO" has no model configured')
    })

    it('returns warning for disconnected participant', () => {
        const p1 = makePerformer({ id: 'p1' })
        const p2 = makePerformer({ id: 'p2', name: 'Second' })
        const p3 = makePerformer({ id: 'p3', name: 'Third' })
        const act = makeAct({
            participants: {
                'agent-a': { performerRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { performerRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
                'agent-c': { performerRef: { kind: 'draft', draftId: 'p3' }, position: { x: 200, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'agent-b'] as [string, string],
                direction: 'both',
                name: 'a-b',
                description: 'test',
            }],
        })
        const result = evaluateActReadiness(act, [p1, p2, p3])
        // runnable because all have models and at least one relation exists
        expect(result.runnable).toBe(true)
        const disconnected = result.issues.find((i) => i.code === 'disconnected-participant')
        expect(disconnected).toBeDefined()
        expect(disconnected!.severity).toBe('warning')
        expect(disconnected!.message).toContain('agent-c')
    })

    it('resolves registry performer ref by derivedFrom URN', () => {
        const performer = makePerformer({
            id: 'p1',
            meta: { derivedFrom: 'performer/@acme/my-stage/my-performer' },
        })
        const act = makeAct({
            participants: {
                'agent-a': {
                    performerRef: { kind: 'registry', urn: 'performer/@acme/my-stage/my-performer' },
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateActReadiness(act, [performer])
        expect(result.runnable).toBe(true)
    })

    it('handles fully valid multi-participant Act', () => {
        const p1 = makePerformer({ id: 'p1' })
        const p2 = makePerformer({ id: 'p2', name: 'Second' })
        const act = makeAct({
            participants: {
                'agent-a': { performerRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { performerRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'agent-b'] as [string, string],
                direction: 'both',
                name: 'test-relation',
                description: 'test',
            }],
        })
        const result = evaluateActReadiness(act, [p1, p2])
        expect(result.runnable).toBe(true)
        expect(result.issues).toHaveLength(0)
    })
})
