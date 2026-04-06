import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ChatMessage } from '../../types'

let showReasoningSummaries = true

vi.mock('../../store/settingsSlice', () => ({
    useUISettings: (selector: (state: { showReasoningSummaries: boolean }) => unknown = (state) => state) => selector({
        showReasoningSummaries,
    }),
}))

vi.mock('../../components/shared/MarkdownRenderer', () => ({
    default: ({ content, showThinking = true, streaming = false }: { content: string; showThinking?: boolean; streaming?: boolean }) => React.createElement(
        'mock-markdown',
        {
            'data-content': content,
            'data-show-thinking': String(showThinking),
            'data-streaming': String(streaming),
        },
    ),
}))

vi.mock('./ToolGroup', () => ({
    ToolGroup: () => React.createElement('mock-tool-group'),
}))

import ChatMessageContent from './ChatMessageContent'

function renderMessage(
    message: Pick<ChatMessage, 'content' | 'parts'>,
    options: { streaming?: boolean } = {},
) {
    return renderToStaticMarkup(
        React.createElement(ChatMessageContent, {
            message,
            streaming: options.streaming ?? false,
        }),
    )
}

describe('ChatMessageContent', () => {
    beforeEach(() => {
        showReasoningSummaries = true
    })

    it('shows reasoning summaries even after streaming completes', () => {
        const html = renderMessage({
            content: '',
            parts: [
                {
                    id: 'part-1',
                    type: 'reasoning',
                    content: 'Investigating the request carefully.',
                },
            ],
        })

        expect(html).toContain('Thinking')
        expect(html).toContain('Investigating the request carefully.')
    })

    it('keeps thinking blocks enabled for completed markdown responses', () => {
        const html = renderMessage({
            content: '<think>Hidden plan</think>\n\nVisible answer',
            parts: [],
        })

        expect(html).toContain('data-show-thinking="true"')
    })

    it('forwards streaming mode to the markdown renderer', () => {
        const html = renderMessage(
            {
                content: '<think>Streaming plan',
                parts: [],
            },
            { streaming: true },
        )

        expect(html).toContain('data-streaming="true"')
    })
})
