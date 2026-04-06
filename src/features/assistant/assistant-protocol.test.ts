import { describe, expect, it } from 'vitest'

import {
    extractAssistantActionEnvelope,
    lintAssistantActionEnvelope,
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

    it('accepts Tal draft CRUD envelopes', () => {
        const content = [
            'Updated the Tal draft.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"tal","name":"Writer Tal","content":"# Role"},{"type":"updateTalDraft","draftRef":"tal","content":"# Updated Role"},{"type":"deleteTalDraft","draftRef":"tal"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Updated the Tal draft.')
    })

    it('accepts Dance draft CRUD envelopes', () => {
        const content = [
            'Updated the Dance draft.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createDanceDraft","ref":"dance","name":"Review Skill","content":"# Skill"},{"type":"updateDanceDraft","draftRef":"dance","content":"# Updated Skill"},{"type":"deleteDanceDraft","draftRef":"dance"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Updated the Dance draft.')
    })

    it('accepts Performer Stage CRUD envelopes', () => {
        const content = [
            'Updated the performer.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"writer","name":"Writer"},{"type":"updatePerformer","performerRef":"writer","name":"Senior Writer"},{"type":"deletePerformer","performerRef":"writer"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Updated the performer.')
    })

    it('accepts Act Stage CRUD envelopes', () => {
        const content = [
            'Updated the act.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createAct","ref":"review","name":"Code Review"},{"type":"updateAct","actRef":"review","actRules":["Escalate blockers quickly."]},{"type":"deleteAct","actRef":"review"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Updated the act.')
    })

    it('accepts raw JSON envelopes without the assistant-actions wrapper', () => {
        const content = '{"version":1,"actions":[{"type":"createAct","name":"Investment Team"}]}'

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(1)
        expect(result.content).toBe('')
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

    it('rejects unsupported lifecycle actions outside the current surface', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"publishPerformer","performerName":"Reviewer"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
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

    it('accepts legacy from/to relation aliases in createAct payloads', () => {
        const content = [
            'Created the analyst workflow.',
            '<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"macro","name":"Macro Analyst"},{"type":"createPerformer","ref":"equity","name":"Equity Researcher"},{"type":"createAct","name":"Investment Team","participantPerformerRefs":["macro","equity"],"relations":[{"fromPerformerRef":"macro","toPerformerRef":"equity","direction":"one-way","name":"macro handoff","description":"Macro Analyst hands regime context to Equity Researcher."}]}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope?.actions).toHaveLength(3)
        expect(result.content).toBe('Created the analyst workflow.')
    })

    it('rejects createAct relations without both name and description', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"macro","name":"Macro Analyst"},{"type":"createPerformer","ref":"equity","name":"Equity Researcher"},{"type":"createAct","name":"Investment Team","participantPerformerRefs":["macro","equity"],"relations":[{"sourcePerformerRef":"macro","targetPerformerRef":"equity","direction":"one-way","name":"macro handoff"}]}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
    })

    it('rejects connectPerformers actions without both name and description', () => {
        const content = [
            'hello',
            '<assistant-actions>{"version":1,"actions":[{"type":"connectPerformers","actName":"Investment Team","sourcePerformerName":"Macro Analyst","targetPerformerName":"Equity Researcher","direction":"one-way","name":"macro handoff"}]}</assistant-actions>',
        ].join('\n')

        const result = extractAssistantActionEnvelope(content)

        expect(result.envelope).toBeNull()
        expect(result.content).toBe('hello')
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

    it('flags same-block refs that are used before they are created', () => {
        const content = '<assistant-actions>{"version":1,"actions":[{"type":"createAct","name":"Review Flow","participantPerformerRefs":["reviewer","writer"]},{"type":"createPerformer","ref":"reviewer","name":"Reviewer"},{"type":"createPerformer","ref":"writer","name":"Writer"}]}</assistant-actions>'

        const envelope = extractAssistantActionEnvelope(content).envelope

        expect(envelope).not.toBeNull()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([
            {
                level: 'warning',
                actionIndex: 0,
                message: 'createAct has multiple participants but no relations. This often produces a disconnected workflow.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'performer ref "reviewer" is used before it is created in the same action block.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'performer ref "writer" is used before it is created in the same action block.',
            },
        ])
    })

    it('flags duplicate and wrong-kind draft refs', () => {
        const content = '<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"shared-draft","name":"Reviewer Tal","content":"# Role"},{"type":"createDanceDraft","ref":"shared-draft","name":"Review Skill","content":"# Skill"},{"type":"updatePerformer","performerRef":"reviewer","talDraftRef":"shared-draft","addDanceDraftRefs":["shared-draft"]}]}</assistant-actions>'

        const envelope = extractAssistantActionEnvelope(content).envelope

        expect(envelope).not.toBeNull()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([
            {
                level: 'error',
                actionIndex: 1,
                message: 'draft ref "shared-draft" is already declared for a tal draft earlier in the same action block.',
            },
            {
                level: 'error',
                actionIndex: 2,
                message: 'performer ref "reviewer" is used before it is created in the same action block.',
            },
            {
                level: 'error',
                actionIndex: 2,
                message: 'dance draft ref "shared-draft" resolves to a tal draft in the same action block.',
            },
        ])
    })
})
