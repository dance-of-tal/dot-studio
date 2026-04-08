import { describe, expect, it } from 'vitest'
import { collectSessionDiffs, normalizeSessionDiffEntries, resolveSessionReviewDiffs } from './session-review-diffs'
import type { ChatMessage } from '../../types'

describe('session-review-diffs', () => {
    it('normalizes unified-diff-only session.diff entries', () => {
        const diffs = normalizeSessionDiffEntries([
            {
                post_name: 'src/example.ts',
                diff: [
                    '--- a/src/example.ts',
                    '+++ b/src/example.ts',
                    '@@ -1 +1 @@',
                    '-old',
                    '+new',
                ].join('\n'),
            },
        ])

        expect(diffs).toEqual([
            expect.objectContaining({
                file: 'src/example.ts',
                additions: 1,
                deletions: 1,
                status: 'modified',
                rawDiff: expect.stringContaining('+++ b/src/example.ts'),
            }),
        ])
    })

    it('prefers session.diff data over message-derived fallback', () => {
        const messages: ChatMessage[] = [{
            id: 'msg-1',
            role: 'assistant',
            content: '',
            timestamp: 1,
            parts: [{
                id: 'tool-1',
                type: 'tool',
                tool: {
                    name: 'write',
                    callId: 'call-1',
                    status: 'completed',
                    input: { path: 'src/fallback.ts', content: 'hello' },
                },
            }],
        }]

        const diffs = resolveSessionReviewDiffs(messages, [
            {
                file: 'src/primary.ts',
                before: 'old',
                after: 'new',
                additions: 1,
                deletions: 1,
            },
        ])

        expect(diffs).toEqual([
            expect.objectContaining({
                file: 'src/primary.ts',
            }),
        ])
    })

    it('falls back to tool metadata when session.diff is empty', () => {
        const messages: ChatMessage[] = [{
            id: 'msg-1',
            role: 'assistant',
            content: '',
            timestamp: 1,
            parts: [{
                id: 'tool-1',
                type: 'tool',
                tool: {
                    name: 'apply_patch',
                    callId: 'call-1',
                    status: 'completed',
                    metadata: {
                        files: [
                            {
                                relativePath: 'src/from-metadata.ts',
                                type: 'update',
                                additions: 3,
                                deletions: 1,
                                diff: '@@ -1 +1 @@\n-old\n+new',
                            },
                        ],
                    },
                },
            }],
        }]

        const diffs = resolveSessionReviewDiffs(messages, [])

        expect(diffs).toEqual([
            expect.objectContaining({
                file: 'src/from-metadata.ts',
                additions: 1,
                deletions: 1,
                rawDiff: expect.stringContaining('+new'),
            }),
        ])
    })

    it('collects metadata-backed diffs from tool parts', () => {
        const messages: ChatMessage[] = [{
            id: 'msg-1',
            role: 'assistant',
            content: '',
            timestamp: 1,
            parts: [{
                id: 'tool-1',
                type: 'tool',
                tool: {
                    name: 'apply_patch',
                    callId: 'call-1',
                    status: 'completed',
                    metadata: {
                        files: [
                            {
                                relativePath: 'src/example.ts',
                                type: 'create',
                                additions: 4,
                                deletions: 0,
                                after: 'export const value = 1\n',
                            },
                        ],
                    },
                },
            }],
        }]

        expect(collectSessionDiffs(messages)).toEqual([
            expect.objectContaining({
                file: 'src/example.ts',
                status: 'added',
                additions: 4,
            }),
        ])
    })
})
