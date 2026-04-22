import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { copyGitHubDanceSkill } from './dance-github-source.js'

const tempDirs = new Set<string>()

async function makeTempDir(prefix: string) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    tempDirs.add(dir)
    return dir
}

afterEach(async () => {
    await Promise.all([...tempDirs].map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true })
        tempDirs.delete(dir)
    }))
})

describe('copyGitHubDanceSkill', () => {
    it('copies repo-local symlinked bundle folders into the installed dance bundle', async () => {
        const repoRoot = await makeTempDir('dot-gh-source-')
        const workingDir = await makeTempDir('dot-gh-target-')
        const sharedAssetsDir = path.join(repoRoot, 'assets')
        const skillDir = path.join(repoRoot, 'skills', 'privacy-eu')

        await fs.mkdir(sharedAssetsDir, { recursive: true })
        await fs.mkdir(skillDir, { recursive: true })
        await fs.writeFile(path.join(sharedAssetsDir, 'terms.md'), 'privacy terms', 'utf-8')
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Privacy EU', 'utf-8')
        await fs.symlink('../../assets', path.join(skillDir, 'assets'))

        const destinationDir = await copyGitHubDanceSkill(
            workingDir,
            'dance/@kimlawtech/korean-privacy-terms/privacy-eu',
            skillDir,
            { repoRoot },
        )

        await expect(fs.readFile(path.join(destinationDir, 'assets', 'terms.md'), 'utf-8')).resolves.toBe('privacy terms')
        const copiedAssetsStat = await fs.lstat(path.join(destinationDir, 'assets'))
        expect(copiedAssetsStat.isSymbolicLink()).toBe(false)
        expect(copiedAssetsStat.isDirectory()).toBe(true)
    })

    it('rejects symlinks that escape the cloned repository', async () => {
        const repoRoot = await makeTempDir('dot-gh-source-')
        const workingDir = await makeTempDir('dot-gh-target-')
        const externalDir = await makeTempDir('dot-gh-external-')
        const skillDir = path.join(repoRoot, 'skills', 'privacy-eu')

        await fs.mkdir(skillDir, { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Privacy EU', 'utf-8')
        await fs.writeFile(path.join(externalDir, 'secret.txt'), 'do not copy', 'utf-8')
        await fs.symlink(externalDir, path.join(skillDir, 'assets'))

        await expect(copyGitHubDanceSkill(
            workingDir,
            'dance/@kimlawtech/korean-privacy-terms/privacy-eu',
            skillDir,
            { repoRoot },
        )).rejects.toThrow('symlink outside the repository root')
    })
})
