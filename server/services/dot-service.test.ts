import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishStudioAssetMock = vi.fn()
const readDotAuthUserMock = vi.fn()
const searchRegistryMock = vi.fn()
const getRegistryAssetDetailMock = vi.fn()

vi.mock('../lib/dot-source.js', () => ({
    ensureDotDir: vi.fn(),
    getDotDir: vi.fn(),
    getGlobalCwd: vi.fn(),
    getGlobalDotDir: vi.fn(),
    initRegistry: vi.fn(),
    installActWithDependencies: vi.fn(),
    installAsset: vi.fn(),
    installPerformerWithDeps: vi.fn(),
    parsePerformerAsset: vi.fn(),
    readAsset: vi.fn(),
    reportInstall: vi.fn(),
    searchRegistry: searchRegistryMock,
    startLogin: vi.fn(),
}))

vi.mock('../lib/dot-authoring.js', () => ({
    clearDotAuthUser: vi.fn(),
    publishStudioAsset: publishStudioAssetMock,
    readDotAuthUser: readDotAuthUserMock,
    saveLocalStudioAsset: vi.fn(),
    uninstallStudioAsset: vi.fn(),
}))

vi.mock('../lib/cache.js', () => ({
    invalidate: vi.fn(),
}))

vi.mock('./asset-service.js', () => ({
    findInstalledDependents: vi.fn(),
    getRegistryAssetDetail: getRegistryAssetDetailMock,
}))

describe('publishDotAsset', () => {
    beforeEach(() => {
        publishStudioAssetMock.mockReset()
        readDotAuthUserMock.mockReset()
    })

    it('forwards providedAssets to the studio authoring publish boundary', async () => {
        readDotAuthUserMock.mockResolvedValue({
            username: 'acme',
            token: 'token',
        })
        publishStudioAssetMock.mockResolvedValue({
            urn: 'act/@acme/moneymaker/exec-sync',
            published: true,
            dependenciesPublished: ['performer/@acme/moneymaker/ceo'],
            dependenciesSkipped: [],
            dependenciesExisting: [],
        })

        const { publishDotAsset } = await import('./dot-service.js')
        const providedAssets = [{
            kind: 'performer' as const,
            urn: 'performer/@acme/moneymaker/ceo',
            payload: {
                kind: 'performer',
                urn: 'performer/@acme/moneymaker/ceo',
                description: 'CEO',
                payload: {
                    tal: 'tal/@acme/moneymaker/ceo-tal',
                },
            },
            tags: ['executive'],
        }]

        await publishDotAsset('/tmp/moneymaker', {
            kind: 'act',
            slug: 'exec-sync',
            payload: {
                description: 'Exec Sync',
                participants: [
                    { key: 'CEO', performer: 'performer/@acme/moneymaker/ceo' },
                ],
                relations: [],
            },
            tags: ['workflow'],
            providedAssets,
        })

        expect(publishStudioAssetMock).toHaveBeenCalledWith(expect.objectContaining({
            cwd: '/tmp/moneymaker',
            kind: 'act',
            slug: 'exec-sync',
            providedAssets,
            auth: {
                username: 'acme',
                token: 'token',
            },
        }))
    })
})

describe('searchDotRegistry', () => {
    beforeEach(() => {
        searchRegistryMock.mockReset()
        getRegistryAssetDetailMock.mockReset()
    })

    it('hydrates registry performer results with dependency metadata used by Studio drag/drop', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                kind: 'performer',
                name: 'k-lawyer',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
        getRegistryAssetDetailMock.mockResolvedValue({
            kind: 'performer',
            urn: 'performer/@monarchjuno/lawyer/k-lawyer',
            slug: 'k-lawyer',
            name: 'k-lawyer',
            author: '@monarchjuno',
            source: 'registry',
            description: 'Korean lawyer performer',
            tags: ['korean', 'law'],
            talUrn: 'tal/@monarchjuno/lawyer/k-lawyer',
            danceUrns: ['dance/@NomaDamas/k-skill/korean-law-search'],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            mcpConfig: null,
        })

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer', { kind: 'performer', limit: 10 })

        expect(getRegistryAssetDetailMock).toHaveBeenCalledWith('', 'performer', 'monarchjuno', 'lawyer/k-lawyer')
        expect(results).toEqual([
            expect.objectContaining({
                kind: 'performer',
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                author: '@monarchjuno',
                source: 'registry',
                talUrn: 'tal/@monarchjuno/lawyer/k-lawyer',
                danceUrns: ['dance/@NomaDamas/k-skill/korean-law-search'],
                model: { provider: 'openai', modelId: 'gpt-5.4' },
            }),
        ])
    })

    it('hydrates registry act results with participants and relations used by Studio import', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
                kind: 'act',
                name: 'k-lawyer-review',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean law review act',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:40:00.000Z',
            },
        ])
        getRegistryAssetDetailMock.mockResolvedValue({
            kind: 'act',
            urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
            slug: 'k-lawyer-review',
            name: 'k-lawyer-review',
            author: '@monarchjuno',
            source: 'registry',
            description: 'Korean law review act',
            tags: ['korean', 'law'],
            actRules: ['Escalate uncertainty'],
            participants: [
                { key: 'Lawyer', performer: 'performer/@monarchjuno/lawyer/k-lawyer' },
                { key: 'Reviewer', performer: 'performer/@monarchjuno/lawyer/k-reviewer' },
            ],
            relations: [
                {
                    name: 'peer-review',
                    between: ['Lawyer', 'Reviewer'],
                    direction: 'both',
                    description: 'Review each answer',
                },
            ],
        })

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer-review', { kind: 'act', limit: 10 })

        expect(getRegistryAssetDetailMock).toHaveBeenCalledWith('', 'act', 'monarchjuno', 'lawyer/k-lawyer-review')
        expect(results).toEqual([
            expect.objectContaining({
                kind: 'act',
                urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
                author: '@monarchjuno',
                source: 'registry',
                actRules: ['Escalate uncertainty'],
                participants: [
                    { key: 'Lawyer', performer: 'performer/@monarchjuno/lawyer/k-lawyer' },
                    { key: 'Reviewer', performer: 'performer/@monarchjuno/lawyer/k-reviewer' },
                ],
                relations: [
                    expect.objectContaining({
                        name: 'peer-review',
                        between: ['Lawyer', 'Reviewer'],
                    }),
                ],
            }),
        ])
    })

    it('falls back to summary metadata when detail hydration fails', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                kind: 'performer',
                name: 'k-lawyer',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
        getRegistryAssetDetailMock.mockRejectedValue(new Error('registry detail unavailable'))

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer', { kind: 'performer', limit: 10 })

        expect(results).toEqual([
            {
                kind: 'performer',
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                slug: 'k-lawyer',
                name: 'k-lawyer',
                author: '@monarchjuno',
                source: 'registry',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
    })
})
