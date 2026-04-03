import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import stripJsonComments from 'strip-json-comments'
import { getOpencode } from './opencode.js'

export function resolveGlobalConfigPath(): string {
    const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configRoot, 'opencode', 'opencode.json')
}

export async function readGlobalConfigFile(): Promise<Record<string, unknown>> {
    const filePath = resolveGlobalConfigPath()
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(stripJsonComments(raw))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function readGlobalConfigSnapshot() {
    const path = resolveGlobalConfigPath()
    const exists = await fs.access(path).then(() => true).catch(() => false)
    return {
        exists,
        path,
        config: await readGlobalConfigFile(),
    }
}

export function mergeOpenCodeConfig(
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...(Object.keys(current).length === 0 ? { $schema: 'https://opencode.ai/config.json' } : {}),
        ...current,
        ...patch,
        ...(patch.mcp && typeof patch.mcp === 'object' ? { mcp: patch.mcp } : {}),
        ...(patch.tools && typeof patch.tools === 'object' ? { tools: patch.tools } : {}),
    }
}

export async function writeGlobalConfigFile(
    config: Record<string, unknown>,
    options?: {
        dispose?: boolean
    },
) {
    const filePath = resolveGlobalConfigPath()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    if (options?.dispose !== false) {
        const oc = await getOpencode()
        await oc.global.dispose()
    }
    return config
}
