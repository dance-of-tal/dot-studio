import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { getAssetPayload, readAsset } from 'dance-of-tal/lib/registry'
import { resolveRuntimeModel } from './model-catalog.js'
import { findRuntimeModelVariant } from '../../shared/model-variants.js'
import { StudioValidationError } from './opencode-errors.js'

export type DanceDeliveryMode = 'auto' | 'tool' | 'inline'
type PromptAssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

type PromptDraftAsset = {
    id: string
    kind: 'tal' | 'dance' | 'performer' | 'act'
    name: string
    content: unknown
    description?: string
    derivedFrom?: string | null
}

export type ModelSelection = {
    provider: string
    modelId: string
} | null

export type CapabilitySnapshot = {
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
} | null

export type DanceCatalogEntry = {
    urn: string
    description: string
    loadMode: Exclude<DanceDeliveryMode, 'auto'>
    path?: string
    inlineContent?: string
}

export type PromptEnvelope = {
    system: string
    danceCatalog: DanceCatalogEntry[]
    deliveryMode: Exclude<DanceDeliveryMode, 'auto'>
    capabilitySnapshot: CapabilitySnapshot
    toolName?: string
}

export type PromptEnvelopeInput = {
    cwd: string
    talRef: PromptAssetRef | null
    danceRefs: PromptAssetRef[]
    drafts?: Record<string, PromptDraftAsset>
    model: ModelSelection
    modelVariant?: string | null
    danceDeliveryMode?: DanceDeliveryMode
}

const CAPABILITY_LOADER_TOOL_NAME = 'read'

function extractDraftTextContent(draft: PromptDraftAsset | undefined | null): string | null {
    if (!draft) {
        return null
    }

    if (typeof draft.content === 'string') {
        return draft.content
    }

    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.content === 'string') {
            return content.content
        }
        if (typeof content.body === 'string') {
            return content.body
        }
    }

    return null
}

function extractDraftDescription(draft: PromptDraftAsset | undefined | null): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.description === 'string') {
        return draft.description
    }
    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.description === 'string') {
            return content.description
        }
    }
    return ''
}

async function resolveTalContent(
    cwd: string,
    ref: PromptAssetRef | null,
    drafts: Record<string, PromptDraftAsset>,
): Promise<string | null> {
    if (!ref) {
        return null
    }

    if (ref.kind === 'registry') {
        return getAssetPayload(cwd, ref.urn)
    }

    return extractDraftTextContent(drafts[ref.draftId])
}

function draftDisplayName(ref: Extract<PromptAssetRef, { kind: 'draft' }>, drafts: Record<string, PromptDraftAsset>) {
    const draft = drafts[ref.draftId]
    return draft?.name || draft?.description || `draft:${ref.draftId}`
}

function runtimeCapabilityDir(cwd: string) {
    return path.join(path.resolve(cwd), '.dot-studio', 'runtime-capabilities')
}

async function writeCapabilityDocument(
    cwd: string,
    refKey: string,
    payload: {
        title: string
        description: string
        body: string
    },
) {
    const dir = runtimeCapabilityDir(cwd)
    await fs.mkdir(dir, { recursive: true })
    const fileHash = createHash('sha1').update(refKey).digest('hex').slice(0, 16)
    const filePath = path.join(dir, `${fileHash}.md`)
    const doc = [
        `# ${payload.title}`,
        payload.description ? `Description: ${payload.description}` : 'Description: No description provided.',
        '',
        '---',
        '',
        payload.body,
    ].join('\n')
    await fs.writeFile(filePath, doc, 'utf-8')
    return filePath
}

async function materializeCapabilityDocument(
    cwd: string,
    ref: PromptAssetRef,
    drafts: Record<string, PromptDraftAsset>,
) {
    if (ref.kind === 'registry') {
        const asset = await readAsset(cwd, ref.urn)
        const body = await getAssetPayload(cwd, ref.urn)
        if (!body) {
            throw new StudioValidationError(
                `Capability '${ref.urn}' was not found or has no content.`,
                'fix_input',
            )
        }
        return {
            urn: ref.urn,
            description: typeof asset?.description === 'string' ? asset.description : '',
            path: await writeCapabilityDocument(cwd, `registry:${ref.urn}`, {
                title: ref.urn,
                description: typeof asset?.description === 'string' ? asset.description : '',
                body,
            }),
        }
    }

    const draft = drafts[ref.draftId]
    const body = extractDraftTextContent(draft)
    if (!draft || !body) {
        throw new StudioValidationError(
            `Capability draft '${draftDisplayName(ref, drafts)}' was not found or has no content.`,
            'fix_input',
        )
    }

    return {
        urn: `draft/${ref.draftId}`,
        description: extractDraftDescription(draft) || draft.name || 'Draft capability',
        path: await writeCapabilityDocument(cwd, `draft:${ref.draftId}`, {
            title: draft.name || `draft/${ref.draftId}`,
            description: extractDraftDescription(draft) || draft.name || 'Draft capability',
            body,
        }),
    }
}

function buildSystemPreamble(toolName?: string): string {
    const lines = [
        '# Runtime Instructions',
        'The section named Core Instructions is the always-on instruction layer for your role, rules, and operating logic.',
        'The section named Optional Capability Catalog lists extra modules you may consult only when the task actually needs them.',
        'Prefer the minimum capability context needed to complete the task well.',
        'Do not mention internal runtime wiring, capability loading, or system sections unless the user asks about them directly.',
    ]

    if (toolName) {
        lines.push(`When optional capability context is needed, use the '${toolName}' tool to inspect the capability document path listed in the catalog.`)
    }

    return lines.join('\n')
}

function buildTalSection(talContent: string | null): string {
    if (!talContent) {
        return [
            '# Core Instructions',
            'No core instruction asset is configured. Follow the user request directly and stay consistent with the current session context.',
        ].join('\n')
    }

    return [
        '# Core Instructions',
        talContent,
    ].join('\n\n')
}

function buildDanceSection(catalog: DanceCatalogEntry[], toolName?: string): string {
    if (catalog.length === 0) {
        return [
            '# Optional Capability Catalog',
            'No optional capability assets are configured.',
        ].join('\n')
    }

    const lines = [
        '# Optional Capability Usage',
        `Capability bodies are available on demand through '${toolName}'. Use the catalog below to decide whether to load one.`,
        '',
        '# Optional Capability Catalog',
    ]

    for (const entry of catalog) {
        lines.push(`- ${entry.urn}: ${entry.description || 'No description provided.'}${entry.path ? ` (path: ${entry.path})` : ''}`)
    }

    return lines.join('\n')
}

function buildRuntimePreferencesSection(input: {
    variantId?: string | null
    variantSummary?: string | null
}) {
    if (!input.variantId) {
        return null
    }

    const lines = [
        '# Runtime Preferences',
        `Preferred model variant: ${input.variantId}`,
    ]
    if (input.variantSummary) {
        lines.push(`Variant settings: ${input.variantSummary}`)
    }
    lines.push('Apply this preferred runtime profile when supported by the current host and model.')
    return lines.join('\n')
}

export async function buildPromptEnvelope(input: PromptEnvelopeInput): Promise<PromptEnvelope> {
    if (!input.model) {
        throw new Error('A model is required for this performer. Select a model before compiling or sending prompts.')
    }

    const runtimeModel = await resolveRuntimeModel(input.cwd, input.model)
    const capabilitySnapshot = runtimeModel
        ? {
            toolCall: runtimeModel.toolCall,
            reasoning: runtimeModel.reasoning,
            attachment: runtimeModel.attachment,
            temperature: runtimeModel.temperature,
            modalities: runtimeModel.modalities,
        }
        : null
    const selectedVariant = runtimeModel
        ? findRuntimeModelVariant([runtimeModel], input.model.provider, input.model.modelId, input.modelVariant || null)
        : null
    const resolvedVariantId = runtimeModel
        ? selectedVariant?.id || null
        : input.modelVariant || null
    const drafts = input.drafts || {}

    if (input.danceRefs.length > 0 && !capabilitySnapshot?.toolCall) {
        throw new StudioValidationError(
            'The selected model does not support runtime capability loading. Choose a tool-capable model or remove saved capabilities.',
            'choose_model',
        )
    }

    const talContent = await resolveTalContent(input.cwd, input.talRef, drafts)

    let deliveryMode: Exclude<DanceDeliveryMode, 'auto'> = 'tool'
    let toolName: string | undefined

    if (input.danceRefs.length > 0) {
        toolName = CAPABILITY_LOADER_TOOL_NAME
    }

    const danceCatalog: DanceCatalogEntry[] = []
    for (const ref of input.danceRefs) {
        const document = await materializeCapabilityDocument(input.cwd, ref, drafts)
        danceCatalog.push({
            urn: document.urn,
            description: document.description,
            loadMode: deliveryMode,
            path: document.path,
        })
    }

    if (deliveryMode === 'tool' && danceCatalog.some((entry) => entry.loadMode === 'tool')) {
        toolName = toolName || CAPABILITY_LOADER_TOOL_NAME
    }

    const sections = [
        buildSystemPreamble(toolName),
        buildTalSection(talContent),
        buildDanceSection(danceCatalog, toolName),
        buildRuntimePreferencesSection({
            variantId: resolvedVariantId,
            variantSummary: selectedVariant?.summary || null,
        }),
    ]

    return {
        system: sections.filter(Boolean).join('\n\n').trim() || '// No core instructions or optional capabilities configured',
        danceCatalog,
        deliveryMode,
        capabilitySnapshot,
        ...(toolName ? { toolName } : {}),
    }
}
