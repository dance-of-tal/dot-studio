import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MarkdownRenderer, { splitThinking } from './MarkdownRenderer'

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

describe('MarkdownRenderer thinking visibility', () => {
    it('keeps completed thinking collapsed by default', () => {
        const html = renderToStaticMarkup(
            React.createElement(MarkdownRenderer, {
                content: '<think>Plan first</think>\n\nAnswer next',
                streaming: false,
            }),
        )

        expect(html).not.toContain('thinking-content')
    })

    it('starts expanded when think content is streaming', () => {
        const html = renderToStaticMarkup(
            React.createElement(MarkdownRenderer, {
                content: '<think>Plan in progress',
                streaming: true,
            }),
        )

        expect(html).toContain('thinking-content')
    })
})
