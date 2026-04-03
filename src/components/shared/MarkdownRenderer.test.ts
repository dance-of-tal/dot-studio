import { describe, expect, it } from 'vitest'
import { splitThinking } from './MarkdownRenderer'

describe('splitThinking', () => {
    it('extracts a completed think block', () => {
        expect(splitThinking('<think>Plan first</think>\n\nAnswer next')).toEqual({
            thinking: 'Plan first',
            response: 'Answer next',
        })
    })

    it('treats an open think block as streaming thinking content', () => {
        expect(splitThinking('<think>Plan in progress', { streaming: true })).toEqual({
            thinking: 'Plan in progress',
            response: '',
        })
    })

    it('leaves incomplete think markup alone when not streaming', () => {
        expect(splitThinking('<think>Plan in progress')).toEqual({
            thinking: null,
            response: '<think>Plan in progress',
        })
    })
})
