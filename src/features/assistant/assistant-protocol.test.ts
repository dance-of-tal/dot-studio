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
            '<assistant-actions>{"version":1,"actions":[{"type":"updatePerformer","model":{"provider":"openai","modelId":"gpt-4.1"}}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
    })

    it('accepts draft creation and performer update actions', () => {
        const content = [
            'Created a reviewer setup.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"reviewer-tal","name":"Reviewer Tal","content":"# Role\\nReview carefully."},{"type":"createDanceDraft","ref":"review-dance","name":"Review Dance","content":"# Goal\\nReview PRs."},{"type":"createPerformer","ref":"reviewer","name":"Reviewer"},{"type":"updatePerformer","performerRef":"reviewer","talDraftRef":"reviewer-tal","addDanceDraftRefs":["review-dance"]}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(4)
        expect(result.content).toBe('Created a reviewer setup.')
    })

    it('accepts dependency-complete createPerformer payloads', () => {
        const content = [
            'Created the researcher.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"researcher","name":"Researcher","talDraft":{"name":"Researcher Tal","content":"You research carefully."},"addDanceDrafts":[{"name":"Source Validation","content":"# Source Validation"}]}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(1)
        expect(result.content).toBe('Created the researcher.')
    })

    it('accepts install and import actions', () => {
        const content = [
            'Imported the setup.',
            '<assistant-actions>{"version":1,"actions":[{"type":"installRegistryAsset","urn":"performer/@acme/reviewer","scope":"stage"},{"type":"importInstalledPerformer","urn":"performer/@acme/reviewer"},{"type":"addDanceFromGitHub","source":"owner/repo@review-skill","scope":"stage"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Imported the setup.')
    })

    it('accepts act rules and participant subscription actions', () => {
        const content = [
            'Updated the workflow contract.',
            '<assistant-actions>{"version":1,"actions":[{"type":"updateAct","actName":"Code Review","actRules":["Escalate blockers quickly.","Keep review comments actionable."]},{"type":"updateParticipantSubscriptions","actName":"Code Review","performerName":"Reviewer","subscriptions":{"messagesFromPerformerNames":["Developer"],"messageTags":["review-request"],"callboardKeys":["review-summary"],"eventTypes":["runtime.idle"]}}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(2)
        expect(result.content).toBe('Updated the workflow contract.')
    })

    it('rejects act creation payloads that use a string instead of actRules array', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"createAct","name":"Investment Team","actRules":"Always cite evidence."}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
    })

    it('accepts dance bundle file actions for saved draft paths', () => {
        const content = [
            'Expanded the skill bundle.',
            '<assistant-actions>{"version":1,"actions":[{"type":"upsertDanceBundleFile","draftRef":"skill","path":"references/checklist.md","content":"# Checklist"},{"type":"deleteDanceBundleEntry","draftName":"Review Skill","path":"scripts/old-helper.sh"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(2)
        expect(result.content).toBe('Expanded the skill bundle.')
    })

    it('rejects dance bundle file actions with reserved or unsafe paths', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"upsertDanceBundleFile","draftId":"dance-1","path":"SKILL.md","content":"bad"},{"type":"deleteDanceBundleEntry","draftId":"dance-1","path":"../scripts/helper.sh"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
    })
})
