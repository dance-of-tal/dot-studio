import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveLocalStudioAsset } from '../lib/dot-authoring.js'
import { getStudioAsset, listStudioAssets } from './asset-service.js'
import { stageFromWorkingDir } from '../../shared/publish-stage.js'

describe('asset service canonical urn handling', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-assets-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('lists stage-local tal assets from canonical owner/stage/name folders', async () => {
        const saved = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'tal',
            author: 'acme',
            slug: 'reviewer-tal',
            payload: {
                description: 'Reviewer Tal',
                content: '# Review carefully',
            },
        })

        const assets = await listStudioAssets(workingDir, 'tal')
        expect(assets).toEqual([
            expect.objectContaining({
                urn: saved.urn,
                slug: 'reviewer-tal',
                name: 'reviewer-tal',
                author: '@acme',
                source: 'stage',
            }),
        ])
    })

    it('requires canonical stage/name asset path for detail lookups', async () => {
        await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'tal',
            author: 'acme',
            slug: 'reviewer-tal',
            payload: {
                description: 'Reviewer Tal',
                content: '# Review carefully',
            },
        })

        const stage = stageFromWorkingDir(workingDir)
        const detail = await getStudioAsset(workingDir, 'tal', 'acme', `${stage}/reviewer-tal`)
        expect(detail).toEqual(expect.objectContaining({
            urn: `tal/@acme/${stage}/reviewer-tal`,
            slug: 'reviewer-tal',
            name: 'reviewer-tal',
        }))

        await expect(getStudioAsset(workingDir, 'tal', 'acme', 'reviewer-tal')).rejects.toThrow(
            "Asset path must use canonical '<stage>/<name>' format.",
        )
    })
})
