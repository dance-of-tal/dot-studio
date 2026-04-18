/**
 * assistant-service.ts — Agent + skill projection for Studio Assistant.
 *
 * Produces:
 *   managed sidecar: ~/.dot-studio/opencode/{agents,skills,tools}/dot-studio/...
 *   external OpenCode: <workspace>/.opencode/{agents,skills,tools}/dot-studio/...
 *
 * Builtin assistant dances are authored as Agent Skills under:
 *   server/services/studio-assistant/dances/<skill-name>/SKILL.md
 *
 * Assistant tool files are projected alongside the agent so the runtime has a
 * stable mutation tool without relying on text-block parsing.
 *
 * Called eagerly at stage save / project activate — NOT per-send.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseDanceFromSkillMd } from 'dance-of-tal/contracts'
import type { AssistantStageContext } from '../../../shared/assistant-actions.js'
import { STUDIO_DIR } from '../../lib/config.js'
import { getOpencode } from '../../lib/opencode.js'
import { isManagedOpencode } from '../../lib/opencode-sidecar.js'
import { listStudioAssets } from '../asset-service.js'
import { searchDotRegistry, searchSkillsCatalog } from '../dot-service.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'
import { ASSISTANT_TOOL_NAMES, getStaticAssistantTools } from './assistant-tools.js'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'
const AGENT_FILENAME = 'studio-assistant.md'

// ── Source paths ───────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TAL_PATH = path.join(__dirname, 'tal', 'studio-assistant.md')
const DANCES_DIR = path.join(__dirname, 'dances')

// ── Target paths ──────────────────────────────────────
function assistantProjectionRoot(executionDir: string) {
    return isManagedOpencode()
        ? path.join(STUDIO_DIR, 'opencode')
        : path.join(executionDir, '.opencode')
}

function workspaceAssistantProjectionRoot(executionDir: string) {
    return path.join(executionDir, '.opencode')
}

function agentFilePath(executionDir: string) {
    return path.join(assistantProjectionRoot(executionDir), 'agents', 'dot-studio', AGENT_FILENAME)
}

function skillDir(executionDir: string, skillName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'skills', 'dot-studio', skillName)
}

function skillFilePath(executionDir: string, skillName: string) {
    return path.join(skillDir(executionDir, skillName), 'SKILL.md')
}

function toolFilePath(executionDir: string, toolName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'tools', `${toolName}.ts`)
}

function dotStudioAgentPath(opencodeRoot: string) {
    return path.join(opencodeRoot, 'agents', 'dot-studio', AGENT_FILENAME)
}

function dotStudioSkillDir(opencodeRoot: string, skillName: string) {
    return path.join(opencodeRoot, 'skills', 'dot-studio', skillName)
}

function dotStudioToolPath(opencodeRoot: string, toolName: string) {
    return path.join(opencodeRoot, 'tools', `${toolName}.ts`)
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

        skills.push({
            name: skillName,
            description: parsed.description?.trim() || entry.name.replace(/-/g, ' '),
            content: raw.trim(),
            sourceDir: path.join(DANCES_DIR, entry.name),
        })
    }

    return skills.sort((left, right) => left.name.localeCompare(right.name))
}

async function removeStaleBuiltinSkills(
    executionDir: string,
    expectedSkillNames: string[],
): Promise<boolean> {
    const skillsRoot = path.join(assistantProjectionRoot(executionDir), 'skills', 'dot-studio')
    const expected = new Set(expectedSkillNames)
    let changed = false

    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (expected.has(entry.name)) continue

        await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true })
        changed = true
    }

    return changed
}

async function removeStaleAssistantTools(
    executionDir: string,
    expectedToolNames: string[],
): Promise<boolean> {
    const toolsDir = path.join(assistantProjectionRoot(executionDir), 'tools')
    const expected = new Set(expectedToolNames)
    let changed = false

    const entries = await fs.readdir(toolsDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
        const toolName = entry.name.replace(/\.ts$/, '')
        if (!ASSISTANT_TOOL_NAMES.includes(toolName as typeof ASSISTANT_TOOL_NAMES[number])) continue
        if (expected.has(toolName)) continue

        await fs.rm(path.join(toolsDir, entry.name), { force: true })
        changed = true
    }

    return changed
}

async function removeAssistantProjectionAtRoot(
    opencodeRoot: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    let changed = false

    const targets = [
        dotStudioAgentPath(opencodeRoot),
        ...toolNames.map((toolName) => dotStudioToolPath(opencodeRoot, toolName)),
        ...skillNames.map((skillName) => dotStudioSkillDir(opencodeRoot, skillName)),
    ]

    for (const target of targets) {
        const existed = await fs.stat(target).then(() => true).catch(() => false)
        if (!existed) {
            continue
        }
        await fs.rm(target, { recursive: true, force: true })
        changed = true
    }

    const skillsRoot = path.join(opencodeRoot, 'skills', 'dot-studio')
    const remainingSkillEntries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    if (remainingSkillEntries.length === 0) {
        await fs.rm(skillsRoot, { recursive: true, force: true }).catch(() => {})
    }

    const agentDir = path.join(opencodeRoot, 'agents', 'dot-studio')
    const remainingAgentEntries = await fs.readdir(agentDir, { withFileTypes: true }).catch(() => [])
    if (remainingAgentEntries.length === 0) {
        await fs.rm(agentDir, { recursive: true, force: true }).catch(() => {})
    }

    return changed
}

async function removeDuplicateAssistantProjectionAncestors(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const currentDir = path.resolve(executionDir)
    let changed = false

    let cursor = path.dirname(currentDir)
    while (cursor !== currentDir) {
        changed = (await removeAssistantProjectionAtRoot(
            workspaceAssistantProjectionRoot(cursor),
            skillNames,
            toolNames,
        )) || changed

        const parent = path.dirname(cursor)
        if (parent === cursor) {
            break
        }
        cursor = parent
    }

    return changed
}

async function removeDuplicateAssistantProjectionDescendants(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const root = path.resolve(executionDir)
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    let changed = false

    async function pruneDirectory(dir: string): Promise<void> {
        const opencodeDir = workspaceAssistantProjectionRoot(dir)
        const hasProjection = await fs.stat(opencodeDir).then(() => true).catch(() => false)
        if (hasProjection) {
            changed = (await removeAssistantProjectionAtRoot(opencodeDir, skillNames, toolNames)) || changed
        }

        const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const entry of children) {
            if (!entry.isDirectory()) continue
            if (entry.name === '.opencode' || entry.name === 'node_modules') continue
            await pruneDirectory(path.join(dir, entry.name))
        }
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === '.opencode' || entry.name === 'node_modules') continue
        await pruneDirectory(path.join(root, entry.name))
    }

    return changed
}

async function removeManagedWorkspaceAssistantProjection(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    return removeAssistantProjectionAtRoot(
        workspaceAssistantProjectionRoot(executionDir),
        skillNames,
        toolNames,
    )
}

// ── Frontmatter ───────────────────────────────────────
function buildFrontmatter(skillNames: string[], toolNames: string[]): string {
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
    for (const toolName of toolNames) {
        lines.push(`  ${JSON.stringify(toolName)}: true`)
    }
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
        'Use the workspace snapshot as the source of truth for current ids, names, connected models, model variants, draft state, and existing topology.',
        'Choose the lightest valid response mode for each turn:',
        '- explain directly when the user only wants guidance or critique',
        '- ask one short clarifying question when an important choice is unresolved',
        '- call the mutation tool when the request is specific enough',
        '- when a direct create request already specifies the intended roles or workflow, do not ask a redundant confirmation question unless you are proposing a missing Tal draft for approval',
        'If you want to mutate the stage, call the apply_studio_actions tool with one valid action envelope.',
        'Load the smallest relevant guide before calling the tool:',
        '- performer or payload details: `studio-assistant-performer-guide`',
        '- Act or workflow structure: `studio-assistant-act-guide` and `studio-assistant-workflow-guide`',
        '- Tal design or Tal proposal: `studio-assistant-tal-design-guide`',
        '- Studio UI/help questions: `studio-assistant-studio-guide`',
        '- local Dance authoring: `studio-assistant-skill-creator-guide`',
        '- external skill search or apply: `find-skills`',
        'Core mutation rules:',
        '- Keep your user-facing explanation in normal assistant text and send mutations through the tool call only.',
        '- Tool arguments must be a valid action envelope with version=1 and an actions array.',
        '- Validate the whole action envelope before calling the tool. One invalid action causes the tool call to fail.',
        '- Do not paste raw mutation JSON into the reply.',
        '- Do not emit fenced JSON or Markdown code blocks for stage mutations.',
        '- Omit unspecified optional fields entirely. Do not send empty strings, null placeholders, or empty draft objects just to satisfy a schema shape.',
        '- If there are multiple reasonable creation paths, ask a short clarifying question before mutating.',
        '- Missing Tal, Dance, or model details alone are not enough to block a direct team or workflow creation request when the requested roles are already clear.',
        '- When a createPerformer or createAct request does not specify Tal, load `studio-assistant-tal-design-guide` and prefer one short confirmation question that proposes a role-appropriate Tal draft and asks whether Studio should apply it as-is.',
        '- Make the smallest correct set of mutations for the user request.',
        '- Reuse performers, acts, drafts, and relations already present in the Workspace snapshot whenever possible.',
        '- Prefer reuse first, install/import second, and brand-new draft or Stage creation third unless the user clearly asked for something new.',
        '- Prefer explicit ids from the snapshot when available. If you do not know an id, you may use exact names.',
        '- Never invent ids such as performer-1, act-1, relation-1, or draft-1. Use snapshot ids or same-call refs only.',
        '- If you create something and refer to it later in the same tool call, assign a ref on the create action and use performerRef, actRef, or draftRef in later actions.',
        '- Actions are applied sequentially in array order. Treat same-call refs as the main cascade mechanism.',
        '- For models, use values from availableModels in the snapshot. Do not invent provider ids or model ids.',
        '- For model variants, use only the selected model\'s variant ids listed in availableModels[].variants or an already-present performer modelVariant from the snapshot. Do not invent variant ids.',
        '- For a direct create request that names both performers and an Act, prefer one dependency-ordered tool call: create performers first, then createAct.',
        '- You can CRUD all four authoring asset families through this action surface.',
        '- Tal and Dance are local draft create/update/delete only.',
        '- Performer and Act are current Stage create/update/delete only.',
        '- Treat install/import helpers as support paths, not as CRUD for Tal, Dance, Performer, or Act.',
        '- Save Local and Publish are outside this assistant CRUD surface.',
        '- If the user wants to create or improve a Dance bundle, load `studio-assistant-skill-creator-guide`.',
        '- If the user wants to find, compare, recommend, or apply an existing skill, load `find-skills` instead of defaulting to new Dance creation.',
        '- Before recommending or installing a skills.sh or GitHub skill, warn briefly that third-party skills should be reviewed for source trust, install count, maintainer reputation, and actual SKILL.md contents.',
        '- When creating a Performer, reflect the user request in the Performer itself instead of using a generic placeholder.',
        '- Performer description becomes participant focus in Act runtime.',
        '- When the user explicitly names the requested performers, use those role names directly instead of collapsing them into generic substitutes.',
        '- Do not default to creating new Performers without Tal when the user asked for creation but did not specify Tal. Prefer proposing a suitable Tal draft first and asking whether to apply it as-is.',
        '- When the user asks for a workflow, pipeline, team, or multi-role setup, create or update the Act too. Do not stop after creating loose performers.',
        '- When creating or updating an Act, reflect the user request in the Act composition itself.',
        '- actRules must always be an array of strings.',
        '- Act safety threadTimeoutMs is a runtime deadline, not a participant wait_until wake.',
        '- For new multi-participant workflow Acts, prefer adding at least one relation in createAct.',
        '- For a brand-new workflow whose participants are already known, prefer participantPerformerRefs on createAct over follow-up attachPerformerToAct actions.',
        '- For relation payloads, use only source... and target... fields. Legacy from... and to... relation aliases are invalid.',
        '- Every new relation must include a non-empty name and non-empty description.',
        '- Participant subscriptions are wake filters, not permissions. Use callboardKeys as the canonical field name, and eventTypes currently only supports runtime.idle.',
        '- Use createDanceDraft or updateDanceDraft only for SKILL.md content. Keep SKILL.md concise and procedural.',
        '- Use upsertDanceBundleFile for references/, scripts/, assets/, or agents/openai.yaml.',
        '- Do not create extra bundle docs like README.md, QUICK_REFERENCE.md, or CHANGELOG.md unless the user explicitly asked for them.',
        'Canonical createAct tool args:',
        '{"version":1,"actions":[{"type":"createPerformer","ref":"strategy","name":"Strategy Lead"},{"type":"createPerformer","ref":"growth","name":"Growth Lead"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["strategy","growth"],"relations":[{"sourcePerformerRef":"strategy","targetPerformerRef":"growth","direction":"one-way","name":"strategy handoff","description":"Strategy Lead hands channel priorities and targets to Growth Lead."}]}]}',
    ].join('\n')
}

function shouldDiscoverAssets(message: string) {
    const text = message.toLowerCase()
    return [
        'tal', 'dance', 'performer', 'act', 'workflow', 'agent', 'skill', 'registry', 'install', 'import',
        'search', 'find', 'create', 'build', 'apply', 'use', 'attach',
        '만들', '찾', '설치', '가져', '불러', '임포트', '적용', '사용', '붙',
    ].some((token) => text.includes(token))
}

type AssistantSkillIntent = 'create' | 'find' | 'apply' | 'mixed' | null

function mentionsSkillContext(message: string) {
    const text = message.toLowerCase()
    return [
        'skill', 'skills.sh', 'dance',
        '스킬', '댄스',
    ].some((token) => text.includes(token))
}

function inferAssistantSkillIntent(message: string): AssistantSkillIntent {
    if (!mentionsSkillContext(message)) return null

    const text = message.toLowerCase()
    const create =
        [
        'create skill', 'make skill', 'new skill', 'build skill', 'author skill',
        'create dance', 'new dance', 'edit skill', 'update skill', 'improve skill', 'enhance skill',
        'skill creator', 'dance draft',
        '스킬 만들', '스킬 작성', '스킬 개선', '스킬 수정', '댄스 만들', '댄스 작성',
    ].some((token) => text.includes(token))
        || ['create', 'make', 'build', 'author', 'edit', 'update', 'improve', 'enhance', '만들', '작성', '개선', '수정']
            .some((token) => text.includes(token))
    const find =
        [
        'find skill', 'search skill', 'look for skill', 'is there a skill', 'recommend skill',
        'existing skill', 'skills.sh', 'find dance',
        '스킬 찾', '스킬 검색', '스킬 추천', '기존 스킬',
    ].some((token) => text.includes(token))
        || ['find', 'search', 'recommend', '찾', '검색', '추천'].some((token) => text.includes(token))
    const apply =
        [
        'apply skill', 'use skill', 'install skill', 'add skill', 'attach skill',
        'apply dance', 'use dance', 'install dance', 'attach dance', 'import skill',
        '적용', '사용', '설치', '추가', '붙이', '붙여',
    ].some((token) => text.includes(token))
        || ['apply', 'install', 'use', 'attach', 'import'].some((token) => text.includes(token))

    if (create && (find || apply)) return 'mixed'
    if (apply) return 'apply'
    if (find) return 'find'
    if (create) return 'create'
    return null
}

function inferDiscoveryKinds(message: string): Array<'tal' | 'dance' | 'performer' | 'act'> {
    const text = message.toLowerCase()
    const kinds = new Set<'tal' | 'dance' | 'performer' | 'act'>()
    if (text.includes('tal')) kinds.add('tal')
    if (text.includes('dance') || text.includes('skill') || text.includes('skills.sh') || text.includes('댄스') || text.includes('스킬')) kinds.add('dance')
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
        'skill', 'skills', 'dance', 'performer', 'act', 'workflow', 'agent', 'tal',
        '해줘', '해주세요', '찾아줘', '찾아', '설치', '가져와', '가져오기', '불러와', '만들어줘', '만들고', '만들',
        '하는', '하고', '있는', '으로', '에서', '같은', '스킬', '댄스',
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

function buildAssistantSkillIntentPrompt(intent: AssistantSkillIntent): string[] {
    switch (intent) {
        case 'create':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to create or improve a local Dance skill bundle.',
                '- Load and use `studio-assistant-skill-creator-guide`.',
                '- Do not default to skills.sh search unless the user explicitly asks for an existing external skill.',
            ]
        case 'find':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to find or compare existing skills.',
                '- Load and use `find-skills`.',
                '- Prefer installed local matches first, then DOT registry matches, then skills.sh candidates.',
            ]
        case 'apply':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to install or apply an existing skill.',
                '- Load and use `find-skills`.',
                '- If the exact skill is ambiguous, present the best candidates and ask which one to apply.',
                '- Before applying a skills.sh or GitHub skill, warn the user briefly to review the source repo, install count, maintainer reputation, and SKILL.md contents.',
            ]
        case 'mixed':
            return [
                'Skill Intent Hint:',
                '- The message mixes local skill authoring with external skill search or apply.',
                '- Ask one short clarifying question: should Studio create a new local Dance bundle, or use an existing external skill?',
                '- Use `studio-assistant-skill-creator-guide` for create/edit paths and `find-skills` for search/apply paths.',
            ]
        default:
            return []
    }
}

export async function buildAssistantDiscoveryPrompt(workingDir: string, userMessage: string): Promise<string> {
    if (!shouldDiscoverAssets(userMessage)) return ''

    const query = buildDiscoveryQuery(userMessage)
    if (!query) return ''

    const sections: string[] = []
    const skillIntent = inferAssistantSkillIntent(userMessage)
    const includeSkillsCatalog = skillIntent === 'find' || skillIntent === 'apply' || skillIntent === 'mixed'

    sections.push(...buildAssistantSkillIntentPrompt(skillIntent))

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

        if (kind === 'dance' && includeSkillsCatalog) {
            const skills = await searchSkillsCatalog(query, 4).catch(() => [])
            if (skills.length > 0) {
                sections.push(
                    'skills.sh dance matches:',
                    ...skills.slice(0, 3).map((asset) => `- ${asset.name} (${asset.urn}) ${asset.description} install via ${asset.owner}@${asset.name}`),
                    'If you recommend or apply one of these, include a short security warning about reviewing third-party skill contents and source trust first.',
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
    const tools = getStaticAssistantTools()
    const skillNames = skills.map((skill) => skill.name)
    const toolNames = tools.map((tool) => tool.name)
    let changed = false

    if (isManagedOpencode()) {
        changed = (await removeManagedWorkspaceAssistantProjection(executionDir, skillNames, toolNames)) || changed
    }

    changed = (await removeDuplicateAssistantProjectionAncestors(
        executionDir,
        skillNames,
        toolNames,
    )) || changed
    changed = (await removeDuplicateAssistantProjectionDescendants(
        executionDir,
        skillNames,
        toolNames,
    )) || changed

    // 1. Agent file
    const frontmatter = buildFrontmatter(skills.map((s) => s.name), [...ASSISTANT_TOOL_NAMES])
    const body = buildAgentBody(talContent)
    const agentContent = `${frontmatter}\n\n${body}`
    changed = (await writeIfChanged(agentFilePath(executionDir), agentContent)) || changed

    for (const tool of tools) {
        changed = (await writeIfChanged(toolFilePath(executionDir, tool.name), tool.content)) || changed
    }
    changed = (await removeStaleAssistantTools(executionDir, toolNames)) || changed

    // 2. Skill files (one SKILL.md per builtin dance)
    for (const skill of skills) {
        changed = (await writeIfChanged(skillFilePath(executionDir, skill.name), buildSkillFile(skill))) || changed
        const bundleSync = await syncSkillBundleSiblings(skill.sourceDir, skillDir(executionDir, skill.name))
        changed = bundleSync.changed || changed
    }
    changed = (await removeStaleBuiltinSkills(executionDir, skillNames)) || changed

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: executionDir }).catch(() => {})
    }

    return `dot-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
