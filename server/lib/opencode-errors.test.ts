import { describe, expect, it } from 'vitest'

import { normalizeOpencodeError } from './opencode-errors.js'

describe('normalizeOpencodeError', () => {
    it('collapses multiline runtime interruption stacks into a retryable runtime message', () => {
        const payload = normalizeOpencodeError(new Error(
            'All fibers interrupted without error\n'
            + 'at causeSquash (/$bunfs/root/src/index.js:21996:32)\n'
            + 'at <anonymous> (/$bunfs/root/src/index.js:22635:24)',
        ))

        expect(payload.code).toBe('runtime_unavailable')
        expect(payload.retryable).toBe(true)
        expect(payload.detail).toBe('All fibers interrupted without error')
        expect(payload.error).toBe(
            'OpenCode interrupted the current run unexpectedly. Retry in a moment, and if it keeps happening restart OpenCode from Settings.',
        )
    })
})
