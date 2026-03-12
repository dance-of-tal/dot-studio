import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type BinField = string | Record<string, string> | undefined

function readJson(pathname: string): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(pathname, 'utf-8')) as Record<string, unknown>
    } catch {
        return null
    }
}

function findPackageJsonFromEntry(packageName: string, entryPath: string): string | null {
    let currentDir = path.dirname(entryPath)

    while (true) {
        const packageJsonPath = path.join(currentDir, 'package.json')
        const packageJson = readJson(packageJsonPath)
        if (packageJson?.name === packageName) {
            return packageJsonPath
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
            return null
        }
        currentDir = parentDir
    }
}

function resolvePackageJsonPath(packageName: string): string | null {
    try {
        return require.resolve(`${packageName}/package.json`)
    } catch {
        try {
            const entryPath = require.resolve(packageName)
            return findPackageJsonFromEntry(packageName, entryPath)
        } catch {
            return null
        }
    }
}

function resolveBinPath(packageJsonPath: string, binName: string): string | null {
    const packageJson = readJson(packageJsonPath)
    const binField = packageJson?.bin as BinField
    if (!binField) {
        return null
    }

    if (typeof binField === 'string') {
        return path.resolve(path.dirname(packageJsonPath), binField)
    }

    if (typeof binField[binName] === 'string') {
        return path.resolve(path.dirname(packageJsonPath), binField[binName])
    }

    const firstBin = Object.values(binField).find((value): value is string => typeof value === 'string')
    return firstBin ? path.resolve(path.dirname(packageJsonPath), firstBin) : null
}

export function resolvePackageBin(packageName: string, binName: string): string | null {
    const packageJsonPath = resolvePackageJsonPath(packageName)
    if (!packageJsonPath) {
        return null
    }

    return resolveBinPath(packageJsonPath, binName)
}
