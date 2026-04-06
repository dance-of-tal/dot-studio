import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssetCard } from '../types'
import type { StudioState } from './types'
import { importActFromAssetImpl } from './act-slice-helpers'

const {
    getAssetMock,
    getRegistryAssetMock,
    listModelsMock,
    getGlobalConfigMock,
} = vi.hoisted(() => ({
    getAssetMock: vi.fn(),
    getRegistryAssetMock: vi.fn(),
    listModelsMock: vi.fn(),
    getGlobalConfigMock: vi.fn(),
}))

vi.mock('../api', () => ({
    api: {
        assets: {
            get: getAssetMock,
            getRegistry: getRegistryAssetMock,
        },
        models: {
            list: listModelsMock,
        },
        config: {
            getGlobal: getGlobalConfigMock,
        },
    },
}))

vi.mock('../lib/toast', () => ({
    showToast: vi.fn(),
}))

function createHarness() {
    let state = {
        acts: [],
        performers: [],
        canvasCenter: { x: 600, y: 300 },
        workspaceDirty: false,
        selectedActId: null,
        actEditorState: null,
        recordStudioChange: vi.fn(),
    } as unknown as StudioState

    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }

    return {
        get: () => state,
        set,
    }
}

describe('importActFromAssetImpl', () => {
    beforeEach(() => {
        getAssetMock.mockReset()
        getRegistryAssetMock.mockReset()
        listModelsMock.mockReset()
        getGlobalConfigMock.mockReset()
        listModelsMock.mockResolvedValue([
            { provider: 'openai', id: 'gpt-5.4', connected: true },
        ])
        getGlobalConfigMock.mockResolvedValue({ mcp: {} })
    })

    it('materializes installed registry participants with performer config intact', async () => {
        const harness = createHarness()
        const performerUrn = 'performer/@monarchjuno/moneymaker/ceo'

        getAssetMock.mockResolvedValue({
            kind: 'performer',
            urn: performerUrn,
            name: 'ceo',
            slug: 'ceo',
            author: '@monarchjuno',
            source: 'stage',
            description: 'CEO performer',
            tags: ['leadership'],
            talUrn: 'tal/@monarchjuno/moneymaker/ceo-tal',
            danceUrns: ['dance/@monarchjuno/moneymaker/board-briefing'],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: 'reasoning-high',
            mcpConfig: null,
        })

        const asset: AssetCard = {
            kind: 'act',
            urn: 'act/@monarchjuno/moneymaker/fullteam',
            name: 'fullteam',
            author: '@monarchjuno',
            source: 'stage',
            participants: [
                { key: 'CEO', performer: performerUrn },
            ],
            relations: [],
        }

        await importActFromAssetImpl(harness.get, harness.set, asset, {
            width: 640,
            height: 420,
        })

        const state = harness.get()
        expect(state.acts).toHaveLength(1)
        expect(state.performers).toHaveLength(1)
        expect(state.performers[0]).toMatchObject({
            name: 'CEO',
            hidden: true,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: 'reasoning-high',
            talRef: { kind: 'registry', urn: 'tal/@monarchjuno/moneymaker/ceo-tal' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@monarchjuno/moneymaker/board-briefing' }],
            meta: {
                derivedFrom: performerUrn,
                publishBindingUrn: performerUrn,
                authoring: {
                    description: 'CEO performer',
                    slug: 'ceo',
                    tags: ['leadership'],
                },
            },
        })
        expect(getAssetMock).toHaveBeenCalledWith('performer', 'monarchjuno', 'moneymaker/ceo')
    })
})
