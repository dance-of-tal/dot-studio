import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishStudioAssetMock = vi.hoisted(() => vi.fn())
const readDotAuthUserMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/dot-authoring.js', () => ({
    publishStudioAsset: publishStudioAssetMock,
    saveLocalStudioAsset: vi.fn(),
    uninstallStudioAsset: vi.fn(),
    readDotAuthUser: readDotAuthUserMock,
    clearDotAuthUser: vi.fn(),
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
