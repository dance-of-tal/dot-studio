import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { publishStudioAsset } from '../lib/dot-authoring.js'
import { getStudioAsset } from './asset-service.js'
import { installDotAsset } from './dot-service.js'
import { stageFromWorkingDir } from '../../shared/publish-stage.js'

type PublishedRegistryPackage = {
    urn: string
    kind: string
    name: string
    owner: string
    stage: string
    description: string
    tags: string[]
    payload: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('performer publish/install round-trip', () => {
    let publishDir: string
    let installDir: string

    beforeEach(async () => {
        publishDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-performer-publish-'))
        installDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-performer-install-'))
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await fs.rm(publishDir, { recursive: true, force: true }).catch(() => {})
        await fs.rm(installDir, { recursive: true, force: true }).catch(() => {})
    })

    it('preserves canonical model ids across publish and install', async () => {
        const stage = stageFromWorkingDir(publishDir)
        const registry = new Map<string, PublishedRegistryPackage>()
        const publishedPayloads: Record<string, unknown>[] = []

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input)
            const method = String(init?.method || 'GET').toUpperCase()

            if (url.endsWith('/publish') && method === 'POST') {
                const request = JSON.parse(String(init?.body || '{}')) as {
                    payload?: Record<string, unknown>
                }
                const payload = request.payload
                if (!payload || typeof payload.urn !== 'string' || typeof payload.kind !== 'string') {
                    return jsonResponse({ success: false }, 400)
                }

                publishedPayloads.push(payload)
                const [kind, ownerWithAt, stagePart, name] = payload.urn.split('/')
                registry.set(payload.urn, {
                    urn: payload.urn,
                    kind,
                    name,
                    owner: ownerWithAt.replace(/^@/, ''),
                    stage: stagePart,
                    description: typeof payload.description === 'string' ? payload.description : '',
                    tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string') : [],
                    payload,
                })

                return jsonResponse({ success: true })
            }

            const installReportMatch = url.match(/\/registry\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/install$/)
            if (installReportMatch && method === 'POST') {
                return jsonResponse({ success: true })
            }

            const registryGetMatch = url.match(/\/registry\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/)
            if (registryGetMatch && method === 'GET') {
                const [, kind, owner, stagePart, name] = registryGetMatch
                const urn = `${kind}/@${owner}/${stagePart}/${name}`
                const pkg = registry.get(urn)
                if (!pkg) {
                    return jsonResponse({ success: false }, 404)
                }
                return jsonResponse({ success: true, package: pkg })
            }

            return jsonResponse({ error: `Unexpected ${method} ${url}` }, 500)
        })

        const publishResult = await publishStudioAsset({
            cwd: publishDir,
            kind: 'performer',
            slug: 'reviewer',
            payload: {
                description: 'Reviewer Performer',
                tags: ['review'],
                tal: `tal/@acme/${stage}/reviewer-tal`,
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5.4',
                },
                modelVariant: 'reasoning-high',
            },
            providedAssets: [{
                kind: 'tal',
                urn: `tal/@acme/${stage}/reviewer-tal`,
                payload: {
                    kind: 'tal',
                    urn: `tal/@acme/${stage}/reviewer-tal`,
                    description: 'Reviewer Tal',
                    tags: ['tal'],
                    payload: {
                        content: '# Review carefully',
                    },
                },
            }],
            auth: {
                username: 'acme',
                token: 'token',
            },
        })

        const publishedPerformer = publishedPayloads.find((entry) => entry.kind === 'performer') as {
            urn: string
            payload: {
                model?: { provider: string; modelId: string }
                modelVariant?: string
            }
        } | undefined

        expect(publishResult.urn).toBe(`performer/@acme/${stage}/reviewer`)
        expect(publishedPerformer).toBeDefined()
        expect(publishedPerformer?.payload.model).toEqual({
            provider: 'openai',
            modelId: 'gpt-5.4',
        })
        expect(publishedPerformer?.payload.modelVariant).toBe('reasoning-high')

        await installDotAsset(installDir, {
            urn: publishResult.urn,
            scope: 'stage',
        })

        const installedDetail = await getStudioAsset(installDir, 'performer', 'acme', `${stage}/reviewer`)
        expect(installedDetail).toEqual(expect.objectContaining({
            urn: `performer/@acme/${stage}/reviewer`,
            model: {
                provider: 'openai',
                modelId: 'gpt-5.4',
            },
            modelVariant: 'reasoning-high',
            talUrn: `tal/@acme/${stage}/reviewer-tal`,
        }))
    })
})
