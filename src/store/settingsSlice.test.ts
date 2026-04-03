import { beforeEach, describe, expect, it, vi } from 'vitest'

function createStorageMock(): Storage {
    const store = new Map<string, string>()

    return {
        get length() {
            return store.size
        },
        clear() {
            store.clear()
        },
        getItem(key) {
            return store.get(key) ?? null
        },
        key(index) {
            return Array.from(store.keys())[index] ?? null
        },
        removeItem(key) {
            store.delete(key)
        },
        setItem(key, value) {
            store.set(key, value)
        },
    }
}

describe('settingsSlice', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: createStorageMock(),
        })
        vi.resetModules()
    })

    it('drops deprecated follow-up settings during migration', async () => {
        const { migrateUISettings } = await import('./settingsSlice')
        const state = migrateUISettings({
            showReasoningSummaries: false,
            shellToolPartsExpanded: false,
            editToolPartsExpanded: true,
            followup: 'queue',
        })

        expect(state.showReasoningSummaries).toBe(true)
        expect(state.shellToolPartsExpanded).toBe(false)
        expect(state.editToolPartsExpanded).toBe(true)
        expect(Object.prototype.hasOwnProperty.call(state, 'followup')).toBe(false)
        expect(Object.prototype.hasOwnProperty.call(state, 'setFollowup')).toBe(false)
    })
})
