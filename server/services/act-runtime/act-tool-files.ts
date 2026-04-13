import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { COLLABORATION_TOOL_NAMES, STALE_COLLABORATION_TOOL_NAMES, getStaticActTools } from './act-tools.js'

export function buildActToolMap() {
    return Object.fromEntries(COLLABORATION_TOOL_NAMES.map((toolName) => [toolName, true] as const))
}

export async function ensureActToolFiles(
    executionDir: string,
    workingDir: string,
): Promise<void> {
    const actTools = getStaticActTools(workingDir)
    const toolsDir = join(executionDir, '.opencode', 'tools')
    await fs.mkdir(toolsDir, { recursive: true })

    const genericToolNames = new Set<string>(actTools.map((tool) => tool.name))
    const collaborationToolNames = new Set<string>([
        ...COLLABORATION_TOOL_NAMES,
        ...STALE_COLLABORATION_TOOL_NAMES,
    ])

    try {
        const existing = await fs.readdir(toolsDir)
        for (const file of existing) {
            if (!file.endsWith('.ts')) continue
            const toolName = file.replace(/\.ts$/, '')
            if (collaborationToolNames.has(toolName) && !genericToolNames.has(toolName)) {
                await fs.rm(join(toolsDir, file), { force: true }).catch(() => {})
            }
        }
    } catch {
        // tools dir may not exist yet
    }

    for (const tool of actTools) {
        await fs.writeFile(join(toolsDir, `${tool.name}.ts`), tool.content, 'utf-8')
    }
}
