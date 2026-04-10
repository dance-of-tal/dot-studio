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
    const skillsRoot = path.join(executionDir, '.opencode', 'skills', 'dot-studio')
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
        'Use the workspace snapshot as the source of truth for current ids, names, connected models, draft state, and existing topology.',
        'Choose the lightest valid response mode for each turn:',
        '- explain directly when the user only wants guidance or critique',
        '- ask one short clarifying question when an important choice is unresolved',
        '- emit one concrete mutation block when the request is specific enough',
        'If you want to mutate the stage, append exactly one action block at the end of your reply.',
        'Use this exact format with raw JSON only:',
        '<assistant-actions>{"version":1,"actions":[...]}</assistant-actions>',
        'Rules:',
        '- Keep your user-facing explanation outside the action block.',
        '- Omit the action block when no canvas mutation is needed.',
        '- If there are multiple reasonable creation paths, ask a short clarifying question before mutating.',
        '- You can CRUD all four authoring asset families through this action surface: Tal, Dance, Performer, and Act.',
        '- CRUD boundary: Tal and Dance are local draft create/update/delete only.',
        '- CRUD boundary: Performer and Act are current Stage create/update/delete only.',
        '- Valid action types:',
        '  Install/import:   installRegistryAsset, addDanceFromGitHub, importInstalledPerformer, importInstalledAct',
        '  Tal/Dance draft:  createTalDraft, updateTalDraft, deleteTalDraft, createDanceDraft, updateDanceDraft, deleteDanceDraft',
        '  Dance bundle:     upsertDanceBundleFile, deleteDanceBundleEntry',
        '  Performer:        createPerformer (description/Tal/Dance/model/MCP bindings), updatePerformer, deletePerformer',
        '  Act:              createAct (description/actRules/safety/participants/relations), updateAct, deleteAct',
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
        '- Prefer reuse first, install/import second, and brand-new draft or Stage creation third unless the user clearly asked for something new.',
        '- If you create something and refer to it later in the same block, assign a ref on the create action and use performerRef, actRef, or draftRef in later actions.',
        '- Treat same-block refs as the main cascade mechanism for create -> attach, create -> update, create draft -> write bundle files, and similar dependency chains.',
        '- Prefer explicit ids from the snapshot when available. If you do not know an id, you may use exact names.',
        '- Never invent ids such as performer-1, act-1, relation-1, or draft-1. Use snapshot ids or same-block refs only.',
        '- For models, use values from availableModels in the snapshot. Do not invent provider ids or model ids.',
        '- MCP library management is not part of the assistant action surface. Do not try to create or edit Studio MCP library entries via actions.',
        '- addMcpServerNames and removeMcpServerNames only bind existing Studio MCP library server names to a performer.',
        '- If the user needs a new MCP server definition, direct them to Asset Library → Local → Runtime → MCPs.',
        '- Save Local and Publish are outside this assistant CRUD surface. Do not claim you completed them through assistant actions.',
        '- Use installRegistryAsset when a known registry URN should be installed first.',
        '- Use addDanceFromGitHub for GitHub or skills.sh dance installs using owner/repo or owner/repo@skill syntax.',
        '- importInstalledPerformer and importInstalledAct add already-installed assets onto the canvas.',
        '- Treat install/import helpers as support paths, not as CRUD for Tal, Dance, Performer, or Act.',
        '- Distinguish clearly between local Dance authoring and external skill discovery/install.',
        '- If the user wants to create or improve a Dance bundle, load studio-assistant-skill-creator-guide and stay in local draft authoring.',
        '- If the user wants to find, compare, recommend, or apply an existing skill, load find-skills instead of defaulting to new Dance creation.',
        '- Before recommending or installing a skills.sh or GitHub skill, warn briefly that third-party skills should be reviewed for source trust, install count, maintainer reputation, and actual SKILL.md contents.',
        '- If the external skill choice is still ambiguous, present the best candidates and ask which one to use.',
        '- For explicit create, update, or delete requests on Tal, Dance, Performer, or Act, use the matching existing action types directly.',
        '- When creating a Performer, reflect the user request in the Performer itself, including the intended role, Tal, Dance, and model when those are stated or clearly implied.',
        '- Performer description becomes participant focus in Act runtime. When the user describes a participant job or responsibility, capture it in the Performer description.',
        '- Do not create a generic placeholder Performer when the user described a concrete role or working style.',
        '- If the user explicitly says to skip Tal, skip Dance, or skip model selection, honor that and do not add the omitted part.',
        '- If the user did not specify enough detail to choose between multiple reasonable Tal/Dance/model setups, ask a short clarifying question before creating the Performer.',
        '- When creating a new Performer that needs a Tal or Dance, prefer cascading the dependencies in the same block with inline talDraft/addDanceDrafts or same-block draft refs.',
        '- If the Tal or Dance is already known at Performer creation time, prefer one createPerformer action with inline dependency fields over createPerformer followed by updatePerformer.',
        '- When the user asks for a workflow, pipeline, team, or multi-role setup, create or update the Act too. Do not stop after creating loose performers unless the user explicitly asked for performers only.',
        '- When creating or updating an Act, reflect the user request in the Act composition itself: requested participants, requested role split, requested actRules, requested safety guardrails, and requested workflow shape.',
        '- If an Act requires new participants, create the missing Performers in cascade first and make sure those Performers also reflect the user intent instead of using generic defaults.',
        '- Do not create a generic team shape when the user described a specific team, department, company function, or workflow.',
        '- actRules are workspace-level instructions injected into every participant.',
        '- actRules must always be an array of strings. For one rule, still use ["..."].',
        '- Act safety is the runtime guardrail layer for the whole Act. Use it for event caps, quiet windows, loop thresholds, or thread time limits.',
        '- Act safety threadTimeoutMs is a runtime deadline, not a participant wait_until wake. Scheduled participant self-wakes use wait_until with wake_at.',
        '- When createAct already knows the participants, prefer participantPerformerRefs, participantPerformerIds, or participantPerformerNames on createAct instead of separate attachPerformerToAct actions.',
        '- If the user asks you to make a new team or workflow from scratch, prefer creating all missing performers first, then createAct with participantPerformerRefs in the same block.',
        '- For a new multi-participant workflow Act, prefer adding at least one relation in createAct so the workflow is connected instead of leaving an unconnected group.',
        '- A new Act with 2 or more participants but no relations is usually wrong for workflow or team requests. Do not stop at participant-only createAct unless the user explicitly asked for an unconnected group.',
        '- If the user asks for something like a d2c company team, investment team, review flow, or pipeline, create the Act with participants and at least one relation in the same createAct action.',
        '- For inline createAct relations and connectPerformers, use sourceParticipantKey/sourcePerformerId/sourcePerformerRef/sourcePerformerName and targetParticipantKey/targetPerformerId/targetPerformerRef/targetPerformerName.',
        '- Use only source... and target... relation fields. Legacy from... and to... relation aliases are invalid.',
        '- Every new relation must include a non-empty name and non-empty description.',
        '- Use attachPerformerToAct mainly when modifying an existing Act or when the target participant becomes known only after creation. Do not use it as the default path for a newly created Act with known participants.',
        '- Participant subscriptions are wake filters, not permissions. Use callboardKeys as the canonical field name, and eventTypes currently only supports runtime.idle.',
        '- For updateParticipantSubscriptions, use participantKey when known. Otherwise identify the participant or message-source participants by performerId, performerRef, or performerName already attached to that Act.',
        '- If you need to explain participant runtime waiting, use wait_until conditions named message_received, board_key_exists, wake_at, all_of, and any_of. Do not call scheduled self-wakes timeout.',
        '- Tal and Dance can only be created or updated as local drafts (not registry assets).',
        '- Tal and Dance delete requests also operate on local drafts only.',
        '- For asset creation requests involving Tal, Dance, Performer, or Act, it is good to use a short question-and-answer flow when important design choices are still missing.',
        '- In that question flow, ask only the smallest high-value questions needed to determine the asset shape, such as role, responsibility split, model preference, Dance need, or workflow handoff.',
        '- Once the user has answered enough, produce the concrete mutation block that reflects those answers.',
        '- Bundle file actions operate only on saved Dance drafts. Use createDanceDraft first, then use its draftRef in later bundle actions from the same block.',
        '- Use createDanceDraft or updateDanceDraft only for SKILL.md content. Use upsertDanceBundleFile for references/, scripts/, assets/, or agents/openai.yaml.',
        '- When authoring a Dance bundle, keep SKILL.md concise and procedural. Put long examples, schemas, and decision tables in references/ instead of bloating SKILL.md.',
        '- Add scripts/ only when deterministic execution or repeated boilerplate materially improves reliability. Add assets/ only for reusable output resources.',
        '- The Dance frontmatter name and description should make the skill easy to trigger from the user request.',
        '- Do not create extra bundle docs like README.md, QUICK_REFERENCE.md, or CHANGELOG.md unless the user explicitly asked for them.',
        '- If the user wants to apply an external Dance to a known Performer and the installed Dance URN is known from discovery hints, you may install it with addDanceFromGitHub and then attach it via addDanceUrns in the same action block.',
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
