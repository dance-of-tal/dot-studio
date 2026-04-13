import { getOpencode } from '../lib/opencode.js'
import { unwrapOpencodeResult } from '../lib/opencode-errors.js'
import { mergeOpenCodeConfig, readGlobalConfigFile } from '../lib/global-config.js'
import { fetchProviderListData } from '../lib/model-catalog.js'
import { readProjectConfigFile } from '../lib/project-config.js'
import { getActRuntimeService } from './act-runtime/act-runtime-service.js'
import { resolveSessionOwnership, setSessionSidebarTitle } from './session-ownership-service.js'

type ModelSelection = {
    providerID: string
    modelID: string
}

type SessionMessageLike = {
    info?: {
        role?: string
    }
}

type ProviderListEntry = {
    models?: Record<string, unknown>
    options?: {
        region?: string
    }
}

type ProviderListData = {
    all?: Array<ProviderListEntry & { id?: string }>
}

type PromptPart = {
    type?: string
    text?: string
}

function normalizeThreadTitle(value: string | null | undefined): string {
    return value?.trim() || ''
}

function shouldReplaceGeneratedTitle(
    currentTitle: string | null | undefined,
    provisionalTitle: string | null | undefined,
    generatedTitle: string | null | undefined,
) {
    const current = normalizeThreadTitle(currentTitle)
    const provisional = normalizeThreadTitle(provisionalTitle)
    const generated = normalizeThreadTitle(generatedTitle)

    if (!generated) {
        return false
    }
    if (!current) {
        return true
    }
    if (current !== provisional) {
        return false
    }
    return current !== generated
}

function parseConfiguredModel(value: unknown): ModelSelection | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    const slash = trimmed.indexOf('/')
    if (slash <= 0 || slash === trimmed.length - 1) {
        return null
    }

    return {
        providerID: trimmed.slice(0, slash),
        modelID: trimmed.slice(slash + 1),
    }
}

async function resolveConfiguredSmallModel(workingDir: string): Promise<ModelSelection | null> {
    const [globalConfig, projectConfig] = await Promise.all([
        readGlobalConfigFile(),
        readProjectConfigFile(workingDir),
    ])
    const merged = mergeOpenCodeConfig(globalConfig, projectConfig)
    return parseConfiguredModel(merged.small_model)
}

function pickProviderModel(provider: ProviderListEntry | undefined, providerID: string): string | null {
    if (!provider?.models || typeof provider.models !== 'object') {
        return null
    }

    let priority = [
        'claude-haiku-4-5',
        'claude-haiku-4.5',
        '3-5-haiku',
        '3.5-haiku',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gpt-5-nano',
    ]
    if (providerID.startsWith('opencode')) {
        priority = ['gpt-5-nano']
    }
    if (providerID.startsWith('github-copilot')) {
        priority = ['gpt-5-mini', 'claude-haiku-4.5', ...priority]
    }

    const modelIds = Object.keys(provider.models)
    for (const candidate of priority) {
        if (providerID === 'amazon-bedrock') {
            const crossRegionPrefixes = ['global.', 'us.', 'eu.']
            const matches = modelIds.filter((modelId) => modelId.includes(candidate))
            const globalMatch = matches.find((modelId) => modelId.startsWith('global.'))
            if (globalMatch) {
                return globalMatch
            }

            const regionPrefix = provider.options?.region?.split('-')[0]
            if (regionPrefix === 'us' || regionPrefix === 'eu') {
                const regionalMatch = matches.find((modelId) => modelId.startsWith(`${regionPrefix}.`))
                if (regionalMatch) {
                    return regionalMatch
                }
            }

            const unprefixed = matches.find((modelId) => !crossRegionPrefixes.some((prefix) => modelId.startsWith(prefix)))
            if (unprefixed) {
                return unprefixed
            }
            continue
        }

        const match = modelIds.find((modelId) => modelId.includes(candidate))
        if (match) {
            return match
        }
    }

    return null
}

async function resolveTitleModel(workingDir: string, model: ModelSelection): Promise<ModelSelection> {
    const configured = await resolveConfiguredSmallModel(workingDir)
    if (configured) {
        return configured
    }

    const providerData = await fetchProviderListData(workingDir).catch(() => undefined) as ProviderListData | undefined
    const provider = providerData?.all?.find((entry) => entry.id === model.providerID)
    const candidate = pickProviderModel(provider, model.providerID)
    if (candidate) {
        return {
            providerID: model.providerID,
            modelID: candidate,
        }
    }

    return model
}

function extractPromptText(parts: unknown): string | null {
    if (!Array.isArray(parts)) {
        return null
    }

    const lines = (parts as PromptPart[])
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text || '')
        .join('\n')
        .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    return lines[0] || null
}

async function generateTitleFromMessage(
    workingDir: string,
    message: string,
    model: ModelSelection,
): Promise<string | null> {
    const text = message.trim()
    if (!text) {
        return null
    }

    const oc = await getOpencode()
    const selectedModel = await resolveTitleModel(workingDir, model)
    const tempSession = unwrapOpencodeResult<{ id: string }>(await oc.session.create({
        directory: workingDir,
    }))
    if (!tempSession?.id) {
        return null
    }

    try {
        const response = unwrapOpencodeResult<{ parts?: unknown[] }>(await oc.session.prompt({
            sessionID: tempSession.id,
            directory: workingDir,
            agent: 'title',
            model: selectedModel,
            parts: [{
                type: 'text',
                text: `Generate a title for this conversation:\n${text}`,
            }],
        }))
        const title = extractPromptText(response?.parts)
        return title ? title.slice(0, 100).trim() : null
    } finally {
        await oc.session.delete({
            sessionID: tempSession.id,
            directory: workingDir,
        }).catch(() => {})
    }
}

export async function sessionHasUserMessages(workingDir: string, sessionId: string): Promise<boolean> {
    const oc = await getOpencode()
    const messages = unwrapOpencodeResult<SessionMessageLike[]>(await oc.session.messages({
        sessionID: sessionId,
        directory: workingDir,
    })) || []
    return messages.some((entry) => entry?.info?.role === 'user')
}

export async function setInitialStandaloneSessionTitle(input: {
    sessionId: string
    provisionalTitle: string
}) {
    const trimmed = normalizeThreadTitle(input.provisionalTitle)
    if (!trimmed) {
        return false
    }

    const ownership = await resolveSessionOwnership(input.sessionId)
    if (ownership?.ownerKind !== 'performer' || ownership.sidebarTitle?.trim()) {
        return false
    }

    const updated = await setSessionSidebarTitle(input.sessionId, trimmed, { ifUnset: true })
    return !!updated
}

export async function maybeGenerateStandaloneSessionTitle(input: {
    workingDir: string
    sessionId: string
    message: string
    model: ModelSelection
    provisionalTitle?: string | null
}) {
    const generated = await generateTitleFromMessage(input.workingDir, input.message, input.model)
    if (!generated) {
        return false
    }

    const ownership = await resolveSessionOwnership(input.sessionId)
    if (ownership?.ownerKind !== 'performer') {
        return false
    }

    if (!shouldReplaceGeneratedTitle(ownership.sidebarTitle, input.provisionalTitle, generated)) {
        return false
    }

    const updated = await setSessionSidebarTitle(input.sessionId, generated)
    return !!updated
}

export async function setInitialActThreadName(input: {
    workingDir: string
    actId: string
    threadId: string
    provisionalTitle: string
}) {
    const trimmed = normalizeThreadTitle(input.provisionalTitle)
    if (!trimmed) {
        return false
    }

    const runtime = getActRuntimeService(input.workingDir)
    const existing = await runtime.getThread(input.threadId)
    if (!existing.ok || existing.thread?.name?.trim()) {
        return false
    }

    const result = await runtime.renameThread(input.actId, input.threadId, trimmed, { ifUnset: true })
    return result.ok
}

export async function maybeGenerateActThreadName(input: {
    workingDir: string
    actId: string
    threadId: string
    message: string
    model: ModelSelection
    provisionalTitle?: string | null
}) {
    const runtime = getActRuntimeService(input.workingDir)
    const existing = await runtime.getThread(input.threadId)
    if (!existing.ok) {
        return false
    }

    const generated = normalizeThreadTitle(
        await generateTitleFromMessage(input.workingDir, input.message, input.model),
    )
    if (!shouldReplaceGeneratedTitle(existing.thread?.name, input.provisionalTitle, generated)) {
        return false
    }

    const result = await runtime.renameThread(input.actId, input.threadId, generated)
    return result.ok
}
