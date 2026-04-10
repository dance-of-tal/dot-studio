import { describe, expect, it } from 'vitest'

import { resizeTextarea } from './textarea-autosize'

function createTextarea(scrollHeight: number) {
    return {
        scrollHeight,
        style: {
            height: '',
            overflowY: '',
        },
    } as HTMLTextAreaElement
}

describe('resizeTextarea', () => {
    it('shrinks the textarea back to a single line when content is cleared', () => {
        const textarea = createTextarea(24)
        textarea.style.height = '96px'
        textarea.style.overflowY = 'auto'

        resizeTextarea(textarea)

        expect(textarea.style.height).toBe('24px')
        expect(textarea.style.overflowY).toBe('hidden')
    })

    it('caps the height and enables scrolling for tall content', () => {
        const textarea = createTextarea(160)

        resizeTextarea(textarea, 102)

        expect(textarea.style.height).toBe('102px')
        expect(textarea.style.overflowY).toBe('auto')
    })
})
