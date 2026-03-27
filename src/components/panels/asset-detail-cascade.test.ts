import { describe, expect, it } from 'vitest'
import type { LibraryAsset } from './asset-panel-types'
import {
    buildCascadeStubFromUrn,
    getActCascadeParticipants,
    getActCascadeRelations,
    getActRules,
    getPerformerCascadeReferences,
    summarizeMarkdown,
} from './asset-detail-cascade'

describe('buildCascadeStubFromUrn', () => {
    it('builds a fetchable stub for staged assets', () => {
        expect(buildCascadeStubFromUrn('performer/@user/my-stage/reviewer', 'stage')).toMatchObject({
            kind: 'performer',
            author: '@user',
            name: 'reviewer',
            source: 'stage',
        })
    })

    it('returns null when source cannot be resolved', () => {
        expect(buildCascadeStubFromUrn('tal/@user/checklist', 'draft')).toBeNull()
    })
})

describe('summarizeMarkdown', () => {
    it('strips common markdown formatting', () => {
        expect(summarizeMarkdown('# Title\n- item with `code` and [link](https://example.com)'))
            .toBe('Title item with and link')
    })
})

describe('getPerformerCascadeReferences', () => {
    it('extracts tal and dance references from performer assets', () => {
        const performer = {
            kind: 'performer',
            name: 'reviewer',
            author: '@user',
            source: 'stage',
            talUrn: 'tal/@user/my-stage/reviewer-tal',
            danceUrns: ['dance/@user/my-stage/review-flow'],
        } as LibraryAsset

        expect(getPerformerCascadeReferences(performer)).toEqual([
            expect.objectContaining({ kind: 'tal', label: 'reviewer-tal' }),
            expect.objectContaining({ kind: 'dance', label: 'review-flow' }),
        ])
    })
})

describe('act cascade helpers', () => {
    const act = {
        kind: 'act',
        name: 'qa-loop',
        author: '@user',
        source: 'stage',
        actRules: ['Stay concise'],
        participants: [
            {
                key: 'lead',
                performer: 'performer/@user/my-stage/reviewer',
                subscriptions: {
                    messagesFrom: ['worker'],
                    eventTypes: ['runtime.idle'],
                },
            },
        ],
        relations: [
            {
                name: 'handoff',
                direction: 'one-way',
                between: ['worker', 'lead'],
                description: 'Worker sends drafts to lead.',
            },
        ],
    } as LibraryAsset

    it('extracts participant performer references and subscriptions', () => {
        expect(getActCascadeParticipants(act)).toEqual([
            {
                key: 'lead',
                performer: expect.objectContaining({
                    kind: 'performer',
                    label: 'reviewer',
                }),
                subscriptions: ['from: worker', 'events: runtime.idle'],
            },
        ])
    })

    it('extracts relation summaries', () => {
        expect(getActCascadeRelations(act)).toEqual([
            {
                name: 'handoff',
                direction: 'one-way',
                between: ['worker', 'lead'],
                description: 'Worker sends drafts to lead.',
            },
        ])
    })

    it('returns act rules from structured assets', () => {
        expect(getActRules(act)).toEqual(['Stay concise'])
    })
})
