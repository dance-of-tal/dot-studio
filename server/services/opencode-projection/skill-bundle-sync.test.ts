import { afterEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { syncSkillBundleSiblings } from './skill-bundle-sync.js'

describe('syncSkillBundleSiblings', () => {
    const tempDirs: string[] = []

    afterEach(async () => {
        await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})))
        tempDirs.length = 0
    })

    it('copies sibling files and prunes stale entries while preserving SKILL.md', async () => {
        const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-source-'))
        const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-target-'))
        tempDirs.push(sourceDir, targetDir)

        await fs.mkdir(path.join(sourceDir, 'references'), { recursive: true })
        await fs.mkdir(path.join(sourceDir, 'scripts'), { recursive: true })
        await fs.writeFile(path.join(sourceDir, 'references', 'guide.md'), '# Guide\n', 'utf-8')
        await fs.writeFile(path.join(sourceDir, 'scripts', 'helper.sh'), 'echo hi\n', 'utf-8')

        await fs.writeFile(path.join(targetDir, 'SKILL.md'), '# keep me\n', 'utf-8')
        await fs.writeFile(path.join(targetDir, 'stale.txt'), 'stale\n', 'utf-8')
        await fs.mkdir(path.join(targetDir, 'references'), { recursive: true })
        await fs.writeFile(path.join(targetDir, 'references', 'old.md'), 'old\n', 'utf-8')

        const first = await syncSkillBundleSiblings(sourceDir, targetDir)

        expect(first.changed).toBe(true)
        expect(first.projectedFiles).toEqual(expect.arrayContaining([
            path.join(targetDir, 'references', 'guide.md'),
            path.join(targetDir, 'scripts', 'helper.sh'),
        ]))
        await expect(fs.readFile(path.join(targetDir, 'references', 'guide.md'), 'utf-8')).resolves.toBe('# Guide\n')
        await expect(fs.readFile(path.join(targetDir, 'scripts', 'helper.sh'), 'utf-8')).resolves.toBe('echo hi\n')
        await expect(fs.readFile(path.join(targetDir, 'SKILL.md'), 'utf-8')).resolves.toBe('# keep me\n')
        await expect(fs.stat(path.join(targetDir, 'stale.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(targetDir, 'references', 'old.md'))).rejects.toMatchObject({ code: 'ENOENT' })

        await fs.rm(path.join(sourceDir, 'references', 'guide.md'), { force: true })

        const second = await syncSkillBundleSiblings(sourceDir, targetDir)

        expect(second.changed).toBe(true)
        await expect(fs.stat(path.join(targetDir, 'references', 'guide.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.readFile(path.join(targetDir, 'scripts', 'helper.sh'), 'utf-8')).resolves.toBe('echo hi\n')
    })
})
