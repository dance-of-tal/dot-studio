import { Hono } from 'hono'
import type { PerformerAssetV1 } from '../lib/dot-source.js'
import {
    getDotPerformer,
    searchDotRegistry,
    validateDotPerformer,
} from '../services/dot-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotPerformer = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

dotPerformer.get('/api/dot/performers/:urn{.+}', async (c) => {
    const cwd = requestWorkingDir(c)
    const urn = c.req.param('urn')
    try {
        const performer = await getDotPerformer(cwd, `performer/${urn}`)
        if (!performer) return jsonError(c, 'Performer not found', 404)
        return c.json(performer)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

dotPerformer.get('/api/dot/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        // Call DOT registry + skills.sh in parallel
        const shouldSearchSkillsSh = !kind || kind === 'dance' || kind === 'all'
        const [dotResults, skillsShResults] = await Promise.all([
            searchDotRegistry(query, { kind, limit }),
            shouldSearchSkillsSh ? searchSkillsSh(query).catch(() => []) : Promise.resolve([]),
        ])

        // Deduplicate by name: DOT results take priority
        const dotNames = new Set(dotResults.map((r) => r.name))
        const merged = [...dotResults, ...skillsShResults.filter((r) => !dotNames.has(r.name))]

        return c.json(merged)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

const SKILLS_SH_API = 'https://skills.sh/api/search'

async function searchSkillsSh(query: string) {
    if (!query.trim()) return []
    const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}&limit=10`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as {
        skills: Array<{ id: string; name: string; installs: number; source: string }>
    }
    return (data.skills || []).map((skill) => ({
        urn: `dance/@${skill.source || 'skills.sh'}/${skill.name}`,
        kind: 'dance',
        name: skill.name,
        owner: skill.source || 'skills.sh',
        stage: skill.source?.split('/')[1] || '',
        description: `${formatInstalls(skill.installs)} · from ${skill.source || 'skills.sh'}`,
        tags: ['skills.sh'] as string[],
        installs: skill.installs,
    }))
}

function formatInstalls(count: number): string {
    if (!count || count <= 0) return '0 installs'
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`
    return `${count} install${count === 1 ? '' : 's'}`
}

dotPerformer.post('/api/dot/validate', async (c) => {
    const performer = await c.req.json<PerformerAssetV1>()
    try {
        validateDotPerformer(performer)
        return c.json({ valid: true })
    } catch (error: unknown) {
        return c.json({ valid: false, error: errorMessage(error) })
    }
})

export default dotPerformer
