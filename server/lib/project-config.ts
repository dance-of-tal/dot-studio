import fs from 'fs/promises'
import path from 'path'
import stripJsonComments from 'strip-json-comments'

const PROJECT_CONFIG_FILENAMES = ['opencode.json', 'opencode.jsonc', 'config.json'] as const

export async function resolveProjectConfigPath(cwd: string): Promise<string> {
    for (const filename of PROJECT_CONFIG_FILENAMES) {
        const filePath = path.join(cwd, filename)
        try {
            await fs.access(filePath)
            return filePath
        } catch {
            continue
        }
    }

    return path.join(cwd, 'opencode.json')
}

export async function resolveProjectConfigWritePath(cwd: string): Promise<string> {
    for (const filename of ['opencode.json', 'opencode.jsonc'] as const) {
        const filePath = path.join(cwd, filename)
        try {
            await fs.access(filePath)
            return filePath
        } catch {
            continue
        }
    }

    return path.join(cwd, 'opencode.json')
}

export async function readProjectConfigFile(cwd: string): Promise<Record<string, unknown>> {
    const filePath = await resolveProjectConfigPath(cwd)
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(stripJsonComments(raw))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function writeProjectConfigFile(cwd: string, config: Record<string, unknown>): Promise<string> {
    const filePath = await resolveProjectConfigWritePath(cwd)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    return filePath
}
