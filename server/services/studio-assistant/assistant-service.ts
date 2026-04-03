/**
 * assistant-service.ts — Agent + skill projection for Studio Assistant.
 *
 * Produces:
 *   .opencode/agents/dot-studio/studio-assistant.md               (agent file)
 *   .opencode/skills/dot-studio/<skill-name>/SKILL.md            (one per builtin dance)
 *   .opencode/skills/dot-studio/<skill-name>/<bundle-files>      (projected sibling files)
 *
 * Builtin assistant dances are authored as Agent Skills under:
 *   server/services/studio-assistant/dances/<skill-name>/SKILL.md
 *
 * Tool files are NOT written here — they are injected at send-time via
 * chat-service.ts extraTools to avoid polluting the shared .opencode/tools/ dir.
 *
 * Called eagerly at stage save / project activate — NOT per-send.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseDanceFromSkillMd } from 'dance-of-tal/contracts'
import type { AssistantStageContext } from '../../../shared/assistant-actions.js'
import { getOpencode } from '../../lib/opencode.js'
import { listStudioAssets } from '../asset-service.js'
import { searchDotRegistry, searchSkillsCatalog } from '../dot-service.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'

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
    sourceDir: string | null
}

async function readBuiltinSkills(): Promise<BuiltinSkill[]> {
    const entries = await fs.readdir(DANCES_DIR, { withFileTypes: true })
    const skills: BuiltinSkill[] = []
    const namesFromDirectories = new Set<string>()

    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = path.join(DANCES_DIR, entry.name, 'SKILL.md')
        const raw = await fs.readFile(skillPath, 'utf-8').catch(() => null)
        if (!raw) continue

        const parsed = parseDanceFromSkillMd(raw)
        const skillName = parsed.name?.trim() || entry.name
        if (skillName !== entry.name) {
            throw new Error(`Builtin assistant skill name mismatch for ${skillPath}: expected "${entry.name}", got "${skillName}"`)
        }

        namesFromDirectories.add(skillName)
        skills.push({
            name: skillName,
            description: parsed.description?.trim() || entry.name.replace(/-/g, ' '),
            content: raw.trim(),
            sourceDir: path.join(DANCES_DIR, entry.name),
        })
    }

    // Legacy fallback for flat markdown files while older worktrees migrate.
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        const body = await fs.readFile(path.join(DANCES_DIR, entry.name), 'utf-8')
        const baseName = entry.name.replace(/\.md$/, '')
        const skillName = `studio-assistant-${baseName}`
        if (namesFromDirectories.has(skillName)) {
            continue
        }

        const firstLine = body.trim().split('\n')[0] || ''
        const description = firstLine.startsWith('#')
            ? firstLine.replace(/^#+\s*/, '').trim()
            : baseName.replace(/-/g, ' ')
        skills.push({ name: skillName, description, content: body.trim(), sourceDir: null })
    }

    return skills.sort((left, right) => left.name.localeCompare(right.name))
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

    lines.push('permission:')
    lines.push('  skill:')
    lines.push('    "*": "deny"')
    for (const name of skillNames) {
        lines.push(`    ${JSON.stringify(name)}: "allow"`)
    }
    lines.push('tools:')
    lines.push('  "bash": false')
    lines.push('  "edit": false')
    lines.push('  "write": false')

    lines.push('---')
    return lines.join('\n')
}

// ── Agent body ────────────────────────────────────────
function buildAgentBody(talContent: string): string {
    return talContent.trim()
}

// ── SKILL.md assembly ─────────────────────────────────
function buildSkillFile(skill: BuiltinSkill): string {
    return skill.content
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
        '- If there are multiple reasonable creation paths, ask a short clarifying question before mutating.',
        '- Valid action types:',
        '  Install/import:   installRegistryAsset, addDanceFromGitHub, importInstalledPerformer, importInstalledAct',
        '  Tal/Dance draft:  createTalDraft, updateTalDraft, deleteTalDraft, createDanceDraft, updateDanceDraft, deleteDanceDraft',
        '  Dance bundle:     upsertDanceBundleFile, deleteDanceBundleEntry',
        '  Performer:        createPerformer (inline Tal/Dance/model/MCP bindings), updatePerformer, deletePerformer',
        '  Act:              createAct (description/actRules/participants/relations), updateAct, deleteAct',
        '  Participants:     attachPerformerToAct, detachParticipantFromAct, updateParticipantSubscriptions',
        '  Relations:        connectPerformers, updateRelation, removeRelation',
        '- Use exactly one assistant-actions block and place it at the end of the reply.',
        '- The JSON inside the block must be valid and must not contain comments or trailing commas.',
        '- Do not emit a bare JSON envelope. Always wrap stage mutations in <assistant-actions>...</assistant-actions>.',
        '- Do not emit fenced JSON or Markdown code blocks for stage mutations.',
        '- Validate the whole action envelope before sending it. One invalid action can cause the whole block to be ignored.',
        '- Actions are applied sequentially in array order. If a later action depends on an earlier result, place them in dependency order in the same block.',
        '- Make the smallest correct set of mutations for the user request.',
        '- Reuse performers, acts, drafts, and relations already present in the Workspace snapshot whenever possible.',
        '- If you create something and refer to it later in the same block, assign a ref on the create action and use performerRef, actRef, or draftRef in later actions.',
        '- Treat same-block refs as the main cascade mechanism for create -> attach, create -> update, create draft -> write bundle files, and similar dependency chains.',
        '- Prefer explicit ids from the snapshot when available. If you do not know an id, you may use exact names.',
        '- Never invent ids such as performer-1, act-1, relation-1, or draft-1. Use snapshot ids or same-block refs only.',
        '- For models, use values from availableModels in the snapshot. Do not invent provider ids or model ids.',
        '- MCP library management is not part of the assistant action surface. Do not try to create or edit Studio MCP library entries via actions.',
        '- addMcpServerNames and removeMcpServerNames only bind existing Studio MCP library server names to a performer.',
        '- If the user needs a new MCP server definition, direct them to Asset Library → Local → Runtime → MCPs.',
        '- Use installRegistryAsset when a known registry URN should be installed first.',
        '- Use addDanceFromGitHub for GitHub or skills.sh dance installs using owner/repo or owner/repo@skill syntax.',
        '- importInstalledPerformer and importInstalledAct add already-installed assets onto the canvas.',
        '- When creating a Performer, reflect the user request in the Performer itself, including the intended role, Tal, Dance, and model when those are stated or clearly implied.',
        '- Do not create a generic placeholder Performer when the user described a concrete role or working style.',
        '- If the user explicitly says to skip Tal, skip Dance, or skip model selection, honor that and do not add the omitted part.',
        '- If the user did not specify enough detail to choose between multiple reasonable Tal/Dance/model setups, ask a short clarifying question before creating the Performer.',
        '- When creating a new Performer that needs a Tal or Dance, prefer cascading the dependencies in the same block with inline talDraft/addDanceDrafts or same-block draft refs.',
        '- If the Tal or Dance is already known at Performer creation time, prefer one createPerformer action with inline dependency fields over createPerformer followed by updatePerformer.',
        '- When the user asks for a workflow, pipeline, team, or multi-role setup, create or update the Act too. Do not stop after creating loose performers unless the user explicitly asked for performers only.',
        '- When creating or updating an Act, reflect the user request in the Act composition itself: requested participants, requested role split, requested actRules, and requested workflow shape.',
        '- If an Act requires new participants, create the missing Performers in cascade first and make sure those Performers also reflect the user intent instead of using generic defaults.',
        '- Do not create a generic team shape when the user described a specific team, department, company function, or workflow.',
        '- actRules are workspace-level instructions injected into every participant.',
        '- actRules must always be an array of strings. For one rule, still use ["..."].',
        '- When createAct already knows the participants, prefer participantPerformerRefs, participantPerformerIds, or participantPerformerNames on createAct instead of separate attachPerformerToAct actions.',
        '- If the user asks you to make a new team or workflow from scratch, prefer creating all missing performers first, then createAct with participantPerformerRefs in the same block.',
        '- For a new multi-participant workflow Act, prefer adding at least one relation in createAct so the workflow is connected instead of leaving an unconnected group.',
        '- A new Act with 2 or more participants but no relations is usually wrong for workflow or team requests. Do not stop at participant-only createAct unless the user explicitly asked for an unconnected group.',
        '- If the user asks for something like a d2c company team, investment team, review flow, or pipeline, create the Act with participants and at least one relation in the same createAct action.',
        '- For inline createAct relations and connectPerformers, use sourceParticipantKey/sourcePerformerId/sourcePerformerRef/sourcePerformerName and targetParticipantKey/targetPerformerId/targetPerformerRef/targetPerformerName.',
        '- Never use relation field aliases like fromPerformerRef or toPerformerRef in your output, even if they might be tolerated.',
        '- Every new relation must include a non-empty name and non-empty description.',
        '- Use attachPerformerToAct mainly when modifying an existing Act or when the target participant becomes known only after creation. Do not use it as the default path for a newly created Act with known participants.',
        '- Participant subscriptions are wake filters, not permissions. Use callboardKeys as the canonical field name, and eventTypes currently only supports runtime.idle.',
        '- For updateParticipantSubscriptions, use participantKey when known. Otherwise identify the participant or message-source participants by performerId, performerRef, or performerName already attached to that Act.',
        '- Tal and Dance can only be created or updated as local drafts (not registry assets).',
        '- For asset creation requests involving Tal, Dance, Performer, or Act, it is good to use a short question-and-answer flow when important design choices are still missing.',
        '- In that question flow, ask only the smallest high-value questions needed to determine the asset shape, such as role, responsibility split, model preference, Dance need, or workflow handoff.',
        '- Once the user has answered enough, produce the concrete mutation block that reflects those answers.',
        '- Bundle file actions operate only on saved Dance drafts. Use createDanceDraft first, then use its draftRef in later bundle actions from the same block.',
        '- Use createDanceDraft or updateDanceDraft only for SKILL.md content. Use upsertDanceBundleFile for references/, scripts/, assets/, or agents/openai.yaml.',
        '- Bundle file paths must stay relative to the Dance bundle root. Never target SKILL.md or draft.json through bundle file actions.',
        '- Before emitting createAct, run this self-check: wrapped in assistant-actions, participants attached, relations included for multi-participant workflows, relation endpoints use source/target fields, and every relation has both name and description.',
        '- Do not wrap the assistant-actions block in Markdown fences.',
        '- If the request is ambiguous and you cannot produce a valid mutation safely, ask a short clarifying question instead of guessing.',
        'Canonical createAct pattern:',
        '<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"strategy","name":"Strategy Lead"},{"type":"createPerformer","ref":"growth","name":"Growth Lead"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["strategy","growth"],"relations":[{"sourcePerformerRef":"strategy","targetPerformerRef":"growth","direction":"one-way","name":"strategy handoff","description":"Strategy Lead hands channel priorities and targets to Growth Lead."}]}]}</assistant-actions>',
    ].join('\n')
}

function shouldDiscoverAssets(message: string) {
    const text = message.toLowerCase()
    return [
        'tal', 'dance', 'performer', 'act', 'workflow', 'agent', 'skill', 'registry', 'install', 'import',
        'search', 'find', 'create', 'build', '만들', '찾', '설치', '가져', '불러', '임포트',
    ].some((token) => text.includes(token))
}

function inferDiscoveryKinds(message: string): Array<'tal' | 'dance' | 'performer' | 'act'> {
    const text = message.toLowerCase()
    const kinds = new Set<'tal' | 'dance' | 'performer' | 'act'>()
    if (text.includes('tal')) kinds.add('tal')
    if (text.includes('dance') || text.includes('skill') || text.includes('skills.sh')) kinds.add('dance')
    if (text.includes('performer') || text.includes('agent')) kinds.add('performer')
    if (text.includes('act') || text.includes('workflow') || text.includes('pipeline') || text.includes('team')) {
        kinds.add('act')
        kinds.add('performer')
    }
    if (kinds.size === 0) {
        kinds.add('performer')
        kinds.add('dance')
    }
    return Array.from(kinds)
}

function buildDiscoveryQuery(message: string) {
    const stopwords = new Set([
        'please', 'help', 'with', 'that', 'this', 'for', 'from', 'into', 'using', 'make', 'create', 'build',
        'find', 'search', 'install', 'import', 'add', 'use', 'want', 'need', 'the', 'a', 'an',
        '해줘', '해주세요', '찾아줘', '찾아', '설치', '가져와', '가져오기', '불러와', '만들어줘', '만들고', '만들',
        '하는', '하고', '있는', '으로', '에서', '같은',
    ])
    const tokens = message
        .toLowerCase()
        .replace(/[^a-z0-9@/_\-가-힣\s]+/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopwords.has(token))

    return Array.from(new Set(tokens)).slice(0, 6).join(' ').trim()
}

function matchesDiscoveryQuery(candidate: { name?: string; urn?: string; description?: string }, query: string) {
    const haystack = `${candidate.name || ''} ${candidate.urn || ''} ${candidate.description || ''}`.toLowerCase()
    return query
        .toLowerCase()
        .split(/\s+/)
        .every((token) => !token || haystack.includes(token))
}

export async function buildAssistantDiscoveryPrompt(workingDir: string, userMessage: string): Promise<string> {
    if (!shouldDiscoverAssets(userMessage)) return ''

    const query = buildDiscoveryQuery(userMessage)
    if (!query) return ''

    const sections: string[] = []

    for (const kind of inferDiscoveryKinds(userMessage).slice(0, 2)) {
        const installed = (await listStudioAssets(workingDir, kind))
            .filter((asset) => matchesDiscoveryQuery(asset, query))
            .slice(0, 3)

        if (installed.length > 0) {
            sections.push(
                `Installed ${kind} matches:`,
                ...installed.map((asset) => `- ${asset.name} (${asset.urn}) [${asset.source}]`),
            )
        }

        const registry = await searchDotRegistry(query, { kind, limit: 4 }).catch(() => [])
        if (registry.length > 0) {
            sections.push(
                `Registry ${kind} matches:`,
                ...registry.slice(0, 3).map((asset) => `- ${asset.name} (${asset.urn})`),
            )
        }

        if (kind === 'dance') {
            const skills = await searchSkillsCatalog(query, 4).catch(() => [])
            if (skills.length > 0) {
                sections.push(
                    'skills.sh dance matches:',
                    ...skills.slice(0, 3).map((asset) => `- ${asset.name} (${asset.urn}) install via ${asset.owner}@${asset.name}`),
                )
            }
        }
    }

    if (sections.length === 0) return ''

    return [
        'Relevant Asset Discovery Hints:',
        ...sections,
        'Use these hints only when they clearly match the user request.',
        'If multiple paths are still reasonable, ask the user which path they want.',
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
        const bundleSync = await syncSkillBundleSiblings(skill.sourceDir, skillDir(executionDir, skill.name))
        changed = bundleSync.changed || changed
    }
    changed = (await removeStaleBuiltinSkills(executionDir, skills.map((skill) => skill.name))) || changed

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: executionDir }).catch(() => {})
    }

    return `dot-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
