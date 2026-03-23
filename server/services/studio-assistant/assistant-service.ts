/**
 * assistant-service.ts — Agent + skill projection for Studio Assistant.
 *
 * Produces:
 *   .opencode/agents/dot-studio/studio-assistant.md          (agent file)
 *   .opencode/skills/dot-studio/studio-assistant-<name>/SKILL.md  (one per builtin dance)
 *
 * Tool files are NOT written here — they are injected at send-time via
 * chat-service.ts extraTools to avoid polluting the shared .opencode/tools/ dir.
 *
 * Called eagerly at stage save / project activate — NOT per-send.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AssistantStageContext } from '../../../shared/assistant-actions.js'
import { getOpencode } from '../../lib/opencode.js'

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

async function removeStaleBuiltinSkills(
    executionDir: string,
    expectedSkillNames: string[],
): Promise<boolean> {
    const skillsRoot = path.join(executionDir, '.opencode', 'skills', 'dot-studio')
    const expected = new Set(expectedSkillNames)
    let changed = false

    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!entry.name.startsWith('studio-assistant-')) continue
        if (expected.has(entry.name)) continue

        await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true })
        changed = true
    }

    return changed
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

export function buildAssistantActionPrompt(context: AssistantStageContext | null | undefined): string {
    const snapshot = JSON.stringify(
        context || { workingDir: '', performers: [], acts: [], drafts: [], availableModels: [] },
        null,
        2,
    )

    return [
        'Current Workspace Snapshot:',
        '```json',
        snapshot,
        '```',
        'If you want to mutate the stage, append exactly one action block at the end of your reply.',
        'Use this exact format with raw JSON only:',
        '<assistant-actions>{"version":1,"actions":[...]}</assistant-actions>',
        'Rules:',
        '- Keep your user-facing explanation outside the action block.',
        '- Omit the action block when no canvas mutation is needed.',
        '- Valid action types:',
        '  Tal/Dance draft:  createTalDraft, updateTalDraft, deleteTalDraft, createDanceDraft, updateDanceDraft, deleteDanceDraft',
        '  Performer:        createPerformer (inline Tal/Dance/model/MCP), updatePerformer, deletePerformer',
        '  Act:              createAct (inline participants/relations), updateAct, deleteAct',
        '  Participants:     attachPerformerToAct, detachParticipantFromAct',
        '  Relations:        connectPerformers, updateRelation, removeRelation',
        '- Use exactly one assistant-actions block and place it at the end of the reply.',
        '- The JSON inside the block must be valid and must not contain comments or trailing commas.',
        '- Make the smallest correct set of mutations for the user request.',
        '- Reuse performers, acts, drafts, and relations already present in the Workspace snapshot whenever possible.',
        '- If you create something and refer to it later in the same block, assign a ref on the create action and use performerRef, actRef, or draftRef in later actions.',
        '- Prefer explicit ids from the snapshot when available. If you do not know an id, you may use exact names.',
        '- For models, use values from availableModels in the snapshot. Do not invent provider ids or model ids.',
        '- Tal and Dance can only be created or updated as local drafts (not registry assets).',
        '- Do not wrap the assistant-actions block in Markdown fences.',
        '- If the request is ambiguous and you cannot produce a valid mutation safely, ask a short clarifying question instead of guessing.',
    ].join('\n')
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
 * Ensure the assistant agent and builtin skill files exist.
 * Returns the agent name for use with oc.session.promptAsync().
 *
 * Called at stage save / project activate time.
 */
export async function ensureAssistantAgent(
    executionDir: string,
): Promise<string> {
    const talContent = await readTal()
    const skills = await readBuiltinSkills()
    let changed = false

    // 1. Agent file
    const frontmatter = buildFrontmatter(skills.map((s) => s.name))
    const body = buildAgentBody(talContent)
    const agentContent = `${frontmatter}\n\n${body}`
    changed = (await writeIfChanged(agentFilePath(executionDir), agentContent)) || changed

    // 2. Skill files (one SKILL.md per builtin dance)
    for (const skill of skills) {
        changed = (await writeIfChanged(skillFilePath(executionDir, skill.name), buildSkillFile(skill))) || changed
    }
    changed = (await removeStaleBuiltinSkills(executionDir, skills.map((skill) => skill.name))) || changed

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: executionDir }).catch(() => {})
    }

    return `dot-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
