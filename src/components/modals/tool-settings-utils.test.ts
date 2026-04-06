import { describe, expect, it } from 'vitest'
import {
    BUILTIN_TOOL_DEFINITIONS,
    createToolPermissionDraft,
    mergeToolPermissionConfig,
} from './tool-settings-utils'

describe('tool-settings-utils', () => {
    it('creates a draft with allow defaults for managed tool permissions', () => {
        const draft = createToolPermissionDraft({
            bash: 'deny',
            websearch: 'ask',
            custom_tool: 'deny',
        })

        expect(draft.bash).toBe('deny')
        expect(draft.websearch).toBe('ask')
        expect(draft.read).toBe('allow')
        expect(draft.edit).toBe('allow')
    })

    it('preserves unmanaged permission entries when saving tool settings', () => {
        const draft = createToolPermissionDraft({
            bash: 'deny',
            websearch: 'allow',
        })
        draft.read = 'ask'

        const merged = mergeToolPermissionConfig(
            {
                'github_*': 'ask',
                custom_tool: 'deny',
                read: 'deny',
            },
            draft,
        )

        expect(merged['github_*']).toBe('ask')
        expect(merged.custom_tool).toBe('deny')
        expect(merged.read).toBe('ask')
        expect(merged.bash).toBe('deny')
    })

    it('uses unique managed permission keys even when multiple tool ids share one key', () => {
        const editRows = BUILTIN_TOOL_DEFINITIONS.filter((tool) => tool.permissionKey === 'edit')

        expect(editRows).toHaveLength(1)
        expect(editRows[0].aliases).toContain('write')
        expect(editRows[0].aliases).toContain('apply_patch')
    })
})
