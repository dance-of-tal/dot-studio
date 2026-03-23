import { describe, expect, it } from 'vitest'

import {
    extractAssistantActionEnvelope,
    stripAssistantActionBlock,
} from './assistant-protocol'

describe('assistant-protocol', () => {
    it('extracts assistant action envelope and strips it from visible content', () => {
        const content = [
            'I created a review flow for you.',
            '',
            '<assistant-actions>{"version":1,"actions":[{"type":"createAct","name":"Review Flow"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.content).toBe('I created a review flow for you.')
        expect(result.envelope?.version).toBe(1)
        expect(result.envelope?.actions).toHaveLength(1)
    })

    it('returns original content when the action block is invalid', () => {
        const content = 'hello\n<assistant-actions>{bad json}</assistant-actions>'

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(stripAssistantActionBlock(content)).toBe('hello')
    })

    it('rejects envelopes with invalid action payloads', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"setPerformerModel","provider":"openai"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
    })

    it('accepts draft creation and draft attachment actions', () => {
        const content = [
            'Created a reviewer setup.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"reviewer-tal","name":"Reviewer Tal","content":"# Role\\nReview carefully."},{"type":"createDanceDraft","ref":"review-dance","name":"Review Dance","content":"# Goal\\nReview PRs."},{"type":"createPerformer","ref":"reviewer","name":"Reviewer"},{"type":"setPerformerTal","performerRef":"reviewer","talDraftRef":"reviewer-tal"},{"type":"addPerformerDance","performerRef":"reviewer","danceDraftRef":"review-dance"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(5)
        expect(result.content).toBe('Created a reviewer setup.')
    })

    it('accepts performer and act blueprint actions', () => {
        const content = [
            'Created a review team.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createPerformerBlueprint","ref":"reviewer","name":"Reviewer","talDraft":{"name":"Reviewer Tal","content":"# Role\\nReview carefully."},"danceDrafts":[{"name":"Review Dance","content":"# Goal\\nReview PRs."}],"model":{"provider":"anthropic","modelId":"claude-sonnet-4"}},{"type":"createActBlueprint","ref":"review-flow","name":"Review Flow","participantPerformerRefs":["reviewer"],"relations":[]}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(2)
        expect(result.content).toBe('Created a review team.')
    })
})
