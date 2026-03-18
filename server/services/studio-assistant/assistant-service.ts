/**
 * assistant-service.ts — Agent + skill projection for Studio Assistant.
 *
 * Produces:
 *   .opencode/agents/studio-assistant.md          (agent file)
 *   .opencode/skills/studio-assistant-<name>/SKILL.md  (one per builtin dance)
 *
 * Called eagerly at stage save / project activate — NOT per-send.
 * The assistant relies on OpenCode built-in tools (bash, edit, read, etc.).
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'
const AGENT_FILENAME = 'studio-assistant.md'

// ── Source paths ───────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TAL_PATH = path.join(__dirname, 'tal', 'studio-assistant.md')
const DANCES_DIR = path.join(__dirname, 'dances')

// ── Target paths ──────────────────────────────────────
function agentFilePath(executionDir: string) {
    return path.join(executionDir, '.opencode', 'agents', 'dot-studio', AGENT_FILENAME)
}



function skillDir(executionDir: string, skillName: string) {
    return path.join(executionDir, '.opencode', 'skills', 'dot-studio', skillName)
}

function skillFilePath(executionDir: string, skillName: string) {
    return path.join(skillDir(executionDir, skillName), 'SKILL.md')
}

// ── Read source assets ────────────────────────────────
async function readTal(): Promise<string> {
    return fs.readFile(TAL_PATH, 'utf-8')
}

interface BuiltinSkill {
    name: string
    description: string
    content: string
}

async function readBuiltinSkills(): Promise<BuiltinSkill[]> {
    const entries = await fs.readdir(DANCES_DIR, { withFileTypes: true })
    const skills: BuiltinSkill[] = []
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
            const body = await fs.readFile(path.join(DANCES_DIR, entry.name), 'utf-8')
            const baseName = entry.name.replace(/\.md$/, '')
            const skillName = `studio-assistant-${baseName}`
            // Extract first heading as description, fallback to file name
            const firstLine = body.trim().split('\n')[0] || ''
            const description = firstLine.startsWith('#')
                ? firstLine.replace(/^#+\s*/, '').trim()
                : baseName.replace(/-/g, ' ')
            skills.push({ name: skillName, description, content: body.trim() })
        }
    }
    return skills
}

// ── Frontmatter ───────────────────────────────────────
function buildFrontmatter(skillNames: string[]): string {
    const lines = ['---']
    lines.push('description: "Studio Assistant"')
    lines.push('mode: primary')
    // Model is NOT specified here — passed via promptAsync() to avoid staleness.

    // Permission-based tool/skill access (tools field is deprecated)
    lines.push('permission:')
    lines.push('  edit:')
    lines.push('    "*": "allow"')
    lines.push('  bash:')
    lines.push('    "*": "allow"')

    // Skill permissions: deny-by-default, allow only our builtin skills
    lines.push('  skill:')
    lines.push('    "*": "deny"')
    for (const name of skillNames) {
        lines.push(`    ${JSON.stringify(name)}: "allow"`)
    }

    lines.push('---')
    return lines.join('\n')
}

// ── Agent body ────────────────────────────────────────
function buildAgentBody(talContent: string): string {
    return talContent.trim()
}

// ── SKILL.md assembly ─────────────────────────────────
function buildSkillFile(skill: BuiltinSkill): string {
    const frontmatter = [
        '---',
        `name: ${JSON.stringify(skill.name)}`,
        `description: ${JSON.stringify(skill.description)}`,
        '---',
    ].join('\n')
    return `${frontmatter}\n\n${skill.content}`
}

// ── Write helper ──────────────────────────────────────
async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) return false
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

/**
 * Ensure the assistant agent .md and skill files exist.
 * Returns the agent name for use with oc.session.promptAsync().
 *
 * Called at stage save / project activate time.
 * OpenCode hot-reloads agent files — no dispose() needed.
 * No custom tools are projected — the assistant uses OpenCode built-in tools.
 */
export async function ensureAssistantAgent(
    executionDir: string,
): Promise<string> {
    const talContent = await readTal()
    const skills = await readBuiltinSkills()

    // 1. Agent file
    const frontmatter = buildFrontmatter(skills.map((s) => s.name))
    const body = buildAgentBody(talContent)
    const agentContent = `${frontmatter}\n\n${body}`
    await writeIfChanged(agentFilePath(executionDir), agentContent)

    // 2. Skill files (one SKILL.md per builtin dance)
    for (const skill of skills) {
        await writeIfChanged(skillFilePath(executionDir, skill.name), buildSkillFile(skill))
    }

    return `dot-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
