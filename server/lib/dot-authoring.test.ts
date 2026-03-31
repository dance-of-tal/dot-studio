import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePublishableDependencies, publishStudioAsset, saveLocalStudioAsset } from './dot-authoring.js'
import { stageFromWorkingDir } from '../../shared/publish-stage.js'

describe('publish dependency validation', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-publish-check-'))
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('blocks performer publish when a referenced Dance is only local', async () => {
        const localDance = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'dance',
            author: 'alice',
            slug: 'review-skill',
            payload: {
                description: 'Review skill',
                content: '---\nname: "review-skill"\ndescription: "Review"\n---\n\nbody',
            },
        })

        const performer = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'performer',
            author: 'alice',
            slug: 'reviewer',
            payload: {
                dances: [localDance.urn],
            },
        })

        await expect(ensurePublishableDependencies(workingDir, 'performer', performer.payload)).rejects.toThrow('Export it from the Dance editor, upload it to GitHub, import it from Asset Library, and then try again')
    })

    it('blocks act publish when a local participant performer depends on a local Dance', async () => {
        const localDance = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'dance',
            author: 'alice',
            slug: 'review-skill',
            payload: {
                description: 'Review skill',
                content: '---\nname: "review-skill"\ndescription: "Review"\n---\n\nbody',
            },
        })

        const performer = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'performer',
            author: 'alice',
            slug: 'reviewer',
            payload: {
                dances: [localDance.urn],
            },
        })

        const act = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'act',
            author: 'alice',
            slug: 'review-flow',
            payload: {
                participants: [{ key: 'Reviewer', performer: performer.urn }],
                relations: [],
            },
        })

        await expect(ensurePublishableDependencies(workingDir, 'act', act.payload)).rejects.toThrow('Export it from the Dance editor, upload it to GitHub, import it from Asset Library, and then try again')
    })

    it('publishes performer with provided draft Tal before the root asset', async () => {
        const stage = stageFromWorkingDir(workingDir)
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input)
            if (url.includes('/registry/')) {
                return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
            }
            if (url.endsWith('/publish') && init?.method === 'POST') {
                return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } })
        })

        const result = await publishStudioAsset({
            cwd: workingDir,
            kind: 'performer',
            slug: 'reviewer-performer',
            payload: {
                description: 'Reviewer Performer',
                tags: ['performer'],
                tal: `tal/@acme/${stage}/reviewer-tal`,
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

        expect(result.urn).toBe(`performer/@acme/${stage}/reviewer-performer`)
        expect(result.dependenciesPublished).toEqual([`tal/@acme/${stage}/reviewer-tal`])
        expect(result.published).toBe(true)

        const publishCalls = fetchMock.mock.calls.filter(([, init]) => String(init?.method || '').toUpperCase() === 'POST')
        expect(publishCalls).toHaveLength(2)
    })

    it('publishes nested provided performer and Tal before the root act', async () => {
        const stage = stageFromWorkingDir(workingDir)
        const publishPayloadKinds: string[] = []
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input)
            if (url.includes('/registry/')) {
                return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
            }
            if (url.endsWith('/publish') && init?.body) {
                const request = JSON.parse(String(init.body)) as { payload?: { kind?: string } }
                publishPayloadKinds.push(request.payload?.kind || 'unknown')
                return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } })
        })

        const result = await publishStudioAsset({
            cwd: workingDir,
            kind: 'act',
            slug: 'review-flow',
            payload: {
                description: 'Review Flow',
                tags: ['workflow'],
                participants: [
                    {
                        key: 'Reviewer',
                        performer: `performer/@acme/${stage}/reviewer-performer`,
                    },
                ],
                relations: [],
            },
            providedAssets: [
                {
                    kind: 'performer',
                    urn: `performer/@acme/${stage}/reviewer-performer`,
                    payload: {
                        kind: 'performer',
                        urn: `performer/@acme/${stage}/reviewer-performer`,
                        description: 'Reviewer Performer',
                        tags: ['performer'],
                        payload: {
                            tal: `tal/@acme/${stage}/reviewer-tal`,
                        },
                    },
                },
                {
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
                },
            ],
            auth: {
                username: 'acme',
                token: 'token',
            },
        })

        expect(result.urn).toBe(`act/@acme/${stage}/review-flow`)
        expect(result.dependenciesPublished).toEqual([
            `tal/@acme/${stage}/reviewer-tal`,
            `performer/@acme/${stage}/reviewer-performer`,
        ])
        expect(publishPayloadKinds).toEqual(['tal', 'performer', 'act'])
    })

    it('blocks publish when a provided performer still references a local-only Dance', async () => {
        const stage = stageFromWorkingDir(workingDir)
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            if (url.includes('/registry/')) {
                return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
            }
            return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } })
        })

        const localDance = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'dance',
            author: 'acme',
            slug: 'review-skill',
            payload: {
                description: 'Review skill',
                content: '---\nname: "review-skill"\ndescription: "Review skill"\n---\n\nbody',
            },
        })

        await expect(publishStudioAsset({
            cwd: workingDir,
            kind: 'act',
            slug: 'review-flow',
            payload: {
                description: 'Review Flow',
                tags: ['workflow'],
                participants: [
                    {
                        key: 'Reviewer',
                        performer: `performer/@acme/${stage}/reviewer-performer`,
                    },
                ],
                relations: [],
            },
            providedAssets: [{
                kind: 'performer',
                urn: `performer/@acme/${stage}/reviewer-performer`,
                payload: {
                    kind: 'performer',
                    urn: `performer/@acme/${stage}/reviewer-performer`,
                    description: 'Reviewer Performer',
                    tags: ['performer'],
                    payload: {
                        dances: [localDance.urn],
                    },
                },
            }],
            auth: {
                username: 'acme',
                token: 'token',
            },
        })).rejects.toThrow('Export it from the Dance editor, upload it to GitHub, import it from Asset Library, and then try again')
    })
})
