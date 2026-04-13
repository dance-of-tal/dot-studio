import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    buildOpencodeProjectCheckUrl,
    ensureOpenProjectDir,
    validateExistingProjectDir,
} from './cli-utils.js'

const tempDirs: string[] = []

async function makeTempDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-cli-'))
    tempDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('ensureOpenProjectDir', () => {
    it('creates a missing directory so open can initialize a fresh workspace', async () => {
        const parentDir = await makeTempDir()
        const targetDir = path.join(parentDir, 'new-workspace')

        await expect(ensureOpenProjectDir(targetDir)).resolves.toBe(targetDir)
        await expect(fs.stat(targetDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
    })

    it('rejects when the target path is an existing file', async () => {
        const parentDir = await makeTempDir()
        const targetPath = path.join(parentDir, 'workspace.txt')
        await fs.writeFile(targetPath, 'not a directory', 'utf-8')

        await expect(ensureOpenProjectDir(targetPath)).rejects.toThrow(`Not a directory: ${targetPath}`)
    })
})

describe('validateExistingProjectDir', () => {
    it('rejects missing directories for doctor checks', async () => {
        const parentDir = await makeTempDir()
        const targetDir = path.join(parentDir, 'missing')

        await expect(validateExistingProjectDir(targetDir)).rejects.toThrow(`Directory not found: ${targetDir}`)
    })
})

describe('buildOpencodeProjectCheckUrl', () => {
    it('uses the requested project directory instead of the shell cwd', () => {
        const url = buildOpencodeProjectCheckUrl('http://localhost:4096', '/tmp/requested-workspace')

        expect(url.toString()).toBe('http://localhost:4096/project?directory=%2Ftmp%2Frequested-workspace')
    })
})
