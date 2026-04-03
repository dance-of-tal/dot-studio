#!/usr/bin/env node

import fs from 'fs/promises'

const ACTION_BLOCK_PATTERN = /<assistant-actions>\s*([\s\S]*?)\s*<\/assistant-actions>/i
const RESERVED_ROOT_PATHS = new Set(['SKILL.md', 'draft.json'])

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function isOptionalStringArray(value) {
    return value === undefined || (Array.isArray(value) && value.every((entry) => isNonEmptyString(entry)))
}

function isOptionalEventTypeArray(value) {
    return value === undefined || (Array.isArray(value) && value.every((entry) => entry === 'runtime.idle'))
}

function normalizeBundlePath(value) {
    if (typeof value !== 'string') return null

    const normalized = value
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')

    if (!normalized || normalized.includes('\0')) return null
    if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) return null

    const parts = normalized.split('/').filter(Boolean)
    if (parts.length === 0) return null
    if (parts.some((part) => part === '.' || part === '..')) return null

    const joined = parts.join('/')
    return RESERVED_ROOT_PATHS.has(joined) ? null : joined
}

function isDraftBlueprint(value) {
    return isRecord(value)
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.content)
        && (value.ref === undefined || isNonEmptyString(value.ref))
        && (value.slug === undefined || isNonEmptyString(value.slug))
        && (value.description === undefined || isNonEmptyString(value.description))
        && isOptionalStringArray(value.tags)
        && (value.openEditor === undefined || typeof value.openEditor === 'boolean')
}

function isModelBlueprint(value) {
    return isRecord(value) && isNonEmptyString(value.provider) && isNonEmptyString(value.modelId)
}

function isParticipantSubscriptionsInput(value) {
    return isRecord(value)
        && isOptionalStringArray(value.messagesFromParticipantKeys)
        && isOptionalStringArray(value.messagesFromPerformerIds)
        && isOptionalStringArray(value.messagesFromPerformerRefs)
        && isOptionalStringArray(value.messagesFromPerformerNames)
        && isOptionalStringArray(value.messageTags)
        && isOptionalStringArray(value.callboardKeys)
        && isOptionalEventTypeArray(value.eventTypes)
}

function hasActLocator(action) {
    return isNonEmptyString(action.actId) || isNonEmptyString(action.actRef) || isNonEmptyString(action.actName)
}

function hasPerformerLocator(action) {
    return isNonEmptyString(action.performerId) || isNonEmptyString(action.performerRef) || isNonEmptyString(action.performerName)
}

function hasParticipantLocator(prefix, action) {
    const aliasPrefix = prefix === 'source' ? 'from' : 'to'
    return [
        action[`${prefix}ParticipantKey`] ?? action[`${aliasPrefix}ParticipantKey`],
        action[`${prefix}PerformerId`] ?? action[`${aliasPrefix}PerformerId`],
        action[`${prefix}PerformerRef`] ?? action[`${aliasPrefix}PerformerRef`],
        action[`${prefix}PerformerName`] ?? action[`${aliasPrefix}PerformerName`],
    ].some((value) => isNonEmptyString(value))
}

function isPerformerFields(value) {
    return isRecord(value)
        && (value.model === undefined || value.model === null || isModelBlueprint(value.model))
        && (value.talUrn === undefined || value.talUrn === null || isNonEmptyString(value.talUrn))
        && (value.talDraftId === undefined || isNonEmptyString(value.talDraftId))
        && (value.talDraftRef === undefined || isNonEmptyString(value.talDraftRef))
        && (value.talDraft === undefined || isDraftBlueprint(value.talDraft))
        && isOptionalStringArray(value.addDanceUrns)
        && isOptionalStringArray(value.addDanceDraftIds)
        && isOptionalStringArray(value.addDanceDraftRefs)
        && (value.addDanceDrafts === undefined || (Array.isArray(value.addDanceDrafts) && value.addDanceDrafts.every((draft) => isDraftBlueprint(draft))))
        && isOptionalStringArray(value.removeDanceUrns)
        && isOptionalStringArray(value.removeDanceDraftIds)
        && isOptionalStringArray(value.addMcpServerNames)
        && isOptionalStringArray(value.removeMcpServerNames)
}

function isActRelationBlueprint(value) {
    return isRecord(value)
        && hasParticipantLocator('source', value)
        && hasParticipantLocator('target', value)
        && (value.direction === undefined || value.direction === 'both' || value.direction === 'one-way')
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.description)
}

function hasDraftLocator(action) {
    return isNonEmptyString(action.draftId) || isNonEmptyString(action.draftRef) || isNonEmptyString(action.draftName)
}

function isValidAction(action) {
    if (!isRecord(action) || !isNonEmptyString(action.type)) return false

    switch (action.type) {
        case 'installRegistryAsset':
            return isNonEmptyString(action.urn) && (action.scope === undefined || action.scope === 'global' || action.scope === 'stage')
        case 'addDanceFromGitHub':
            return isNonEmptyString(action.source) && (action.scope === undefined || action.scope === 'global' || action.scope === 'stage')
        case 'importInstalledPerformer':
            return isNonEmptyString(action.urn) || isNonEmptyString(action.performerName)
        case 'importInstalledAct':
            return isNonEmptyString(action.urn) || isNonEmptyString(action.actName)
        case 'createTalDraft':
        case 'createDanceDraft':
            return isNonEmptyString(action.name) && isNonEmptyString(action.content)
        case 'updateTalDraft':
        case 'deleteTalDraft':
        case 'updateDanceDraft':
        case 'deleteDanceDraft':
            return hasDraftLocator(action)
        case 'upsertDanceBundleFile':
            return hasDraftLocator(action) && normalizeBundlePath(action.path) !== null && isNonEmptyString(action.content)
        case 'deleteDanceBundleEntry':
            return hasDraftLocator(action) && normalizeBundlePath(action.path) !== null
        case 'createPerformer':
            return isNonEmptyString(action.name) && isPerformerFields(action)
        case 'updatePerformer':
            return hasPerformerLocator(action) && isPerformerFields(action) && (action.name === undefined || isNonEmptyString(action.name))
        case 'deletePerformer':
            return hasPerformerLocator(action)
        case 'createAct':
            return isNonEmptyString(action.name)
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.actRules)
                && isOptionalStringArray(action.participantPerformerIds)
                && isOptionalStringArray(action.participantPerformerRefs)
                && isOptionalStringArray(action.participantPerformerNames)
                && (action.relations === undefined || (Array.isArray(action.relations) && action.relations.every((relation) => isActRelationBlueprint(relation))))
        case 'updateAct':
            return hasActLocator(action)
                && (action.name === undefined || isNonEmptyString(action.name))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.actRules)
        case 'deleteAct':
            return hasActLocator(action)
        case 'attachPerformerToAct':
            return hasActLocator(action) && hasPerformerLocator(action)
        case 'detachParticipantFromAct':
            return hasActLocator(action) && (isNonEmptyString(action.participantKey) || hasPerformerLocator(action))
        case 'updateParticipantSubscriptions':
            return hasActLocator(action)
                && (isNonEmptyString(action.participantKey) || hasPerformerLocator(action))
                && (action.subscriptions === null || isParticipantSubscriptionsInput(action.subscriptions))
        case 'connectPerformers':
            return hasActLocator(action)
                && hasParticipantLocator('source', action)
                && hasParticipantLocator('target', action)
                && (action.direction === undefined || action.direction === 'both' || action.direction === 'one-way')
                && isNonEmptyString(action.name)
                && isNonEmptyString(action.description)
        case 'updateRelation':
        case 'removeRelation':
            return hasActLocator(action) && isNonEmptyString(action.relationId)
        default:
            return false
    }
}

function parseEnvelope(text) {
    const match = text.match(ACTION_BLOCK_PATTERN)
    const trimmed = text.trim()
    const raw = match ? match[1] : (trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || trimmed)
    try {
        const parsed = JSON.parse(raw)
        if (parsed?.version !== 1 || !Array.isArray(parsed.actions) || !parsed.actions.every((action) => isValidAction(action))) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function pushIssue(issues, level, actionIndex, message) {
    issues.push({ level, actionIndex, message })
}

function registerRef(issues, actionIndex, refs, namespace, value) {
    if (!isNonEmptyString(value)) return
    if (refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is declared more than once in the same action block.`)
        return
    }
    refs.add(value)
}

function registerDraftRef(issues, actionIndex, draftRefs, kind, value) {
    if (!isNonEmptyString(value)) return
    const existing = draftRefs.get(value)
    if (existing) {
        pushIssue(issues, 'error', actionIndex, `draft ref "${value}" is already declared for a ${existing} draft earlier in the same action block.`)
        return
    }
    draftRefs.set(value, kind)
}

function requireRef(issues, actionIndex, refs, namespace, value) {
    if (!isNonEmptyString(value)) return
    if (!refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is used before it is created in the same action block.`)
    }
}

function requireDraftRef(issues, actionIndex, draftRefs, kind, value) {
    if (!isNonEmptyString(value)) return
    const existing = draftRefs.get(value)
    if (!existing) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" is used before it is created in the same action block.`)
        return
    }
    if (existing !== kind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" resolves to a ${existing} draft in the same action block.`)
    }
}

function lintPerformerFields(issues, actionIndex, action, refState) {
    const talSelectorCount = [
        action.talUrn !== undefined,
        isNonEmptyString(action.talDraftId),
        isNonEmptyString(action.talDraftRef),
        isRecord(action.talDraft),
    ].filter(Boolean).length

    if (talSelectorCount > 1) {
        pushIssue(issues, 'error', actionIndex, 'Performer actions must choose only one Tal source among talUrn, talDraftId, talDraftRef, or talDraft.')
    }

    requireDraftRef(issues, actionIndex, refState.drafts, 'tal', action.talDraftRef)
    for (const ref of action.addDanceDraftRefs || []) {
        requireDraftRef(issues, actionIndex, refState.drafts, 'dance', ref)
    }
}

function registerInlineDrafts(issues, actionIndex, action, refState) {
    if (isRecord(action.talDraft)) {
        registerDraftRef(issues, actionIndex, refState.drafts, 'tal', action.talDraft.ref)
    }
    for (const draft of action.addDanceDrafts || []) {
        if (isRecord(draft)) {
            registerDraftRef(issues, actionIndex, refState.drafts, 'dance', draft.ref)
        }
    }
}

function lintRelation(issues, actionIndex, relation, refState) {
    requireRef(issues, actionIndex, refState.performers, 'performer', relation.sourcePerformerRef ?? relation.fromPerformerRef)
    requireRef(issues, actionIndex, refState.performers, 'performer', relation.targetPerformerRef ?? relation.toPerformerRef)
}

function lintEnvelope(envelope) {
    const issues = []
    const refState = {
        performers: new Set(),
        acts: new Set(),
        drafts: new Map(),
    }

    envelope.actions.forEach((action, actionIndex) => {
        switch (action.type) {
            case 'createTalDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'tal', action.ref)
                break
            case 'updateTalDraft':
            case 'deleteTalDraft':
                requireDraftRef(issues, actionIndex, refState.drafts, 'tal', action.draftRef)
                break
            case 'createDanceDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'dance', action.ref)
                break
            case 'updateDanceDraft':
            case 'deleteDanceDraft':
            case 'upsertDanceBundleFile':
            case 'deleteDanceBundleEntry':
                requireDraftRef(issues, actionIndex, refState.drafts, 'dance', action.draftRef)
                break
            case 'createPerformer':
                lintPerformerFields(issues, actionIndex, action, refState)
                registerRef(issues, actionIndex, refState.performers, 'performer', action.ref)
                registerInlineDrafts(issues, actionIndex, action, refState)
                break
            case 'updatePerformer':
                requireRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                lintPerformerFields(issues, actionIndex, action, refState)
                registerInlineDrafts(issues, actionIndex, action, refState)
                break
            case 'deletePerformer':
                requireRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                break
            case 'createAct':
                if ((action.participantPerformerRefs?.length || 0) + (action.participantPerformerIds?.length || 0) + (action.participantPerformerNames?.length || 0) >= 2 && (!action.relations || action.relations.length === 0)) {
                    pushIssue(issues, 'warning', actionIndex, 'createAct has multiple participants but no relations. This often produces a disconnected workflow.')
                }
                for (const ref of action.participantPerformerRefs || []) {
                    requireRef(issues, actionIndex, refState.performers, 'performer', ref)
                }
                for (const relation of action.relations || []) {
                    lintRelation(issues, actionIndex, relation, refState)
                }
                registerRef(issues, actionIndex, refState.acts, 'act', action.ref)
                break
            case 'updateAct':
            case 'deleteAct':
                requireRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                break
            case 'attachPerformerToAct':
            case 'detachParticipantFromAct':
            case 'updateParticipantSubscriptions':
                requireRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                requireRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                if (action.type === 'updateParticipantSubscriptions' && action.subscriptions) {
                    for (const ref of action.subscriptions.messagesFromPerformerRefs || []) {
                        requireRef(issues, actionIndex, refState.performers, 'performer', ref)
                    }
                }
                break
            case 'connectPerformers':
                requireRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                lintRelation(issues, actionIndex, action, refState)
                break
            case 'updateRelation':
            case 'removeRelation':
                requireRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                break
            default:
                break
        }
    })

    return issues
}

async function readInput(argv) {
    const inputPath = argv[2]
    if (!inputPath || inputPath === '-') {
        const chunks = []
        for await (const chunk of process.stdin) {
            chunks.push(chunk)
        }
        return Buffer.concat(chunks).toString('utf-8')
    }
    if (inputPath === '--help' || inputPath === '-h') {
        console.log('Usage: node scripts/typecheck-assistant-actions.mjs [path|-]')
        console.log('Reads a Studio Assistant reply or raw action envelope JSON, validates it, and lints same-block refs.')
        process.exit(0)
    }
    return fs.readFile(inputPath, 'utf-8')
}

const text = await readInput(process.argv)
const envelope = parseEnvelope(text)

if (!envelope) {
    console.error('Invalid assistant action envelope.')
    console.error('Expected <assistant-actions>{"version":1,"actions":[...]}</assistant-actions> or raw JSON with supported action shapes.')
    process.exit(1)
}

const issues = lintEnvelope(envelope)
const errors = issues.filter((issue) => issue.level === 'error')
const warnings = issues.filter((issue) => issue.level === 'warning')

console.log(`Validated ${envelope.actions.length} assistant action(s).`)
console.log(`Action types: ${envelope.actions.map((action) => action.type).join(', ')}`)

for (const issue of issues) {
    const prefix = issue.level === 'error' ? 'ERROR' : 'WARN'
    console.log(`${prefix} action #${issue.actionIndex + 1}: ${issue.message}`)
}

if (errors.length > 0) {
    process.exit(1)
}

if (warnings.length > 0) {
    console.log(`Passed with ${warnings.length} warning(s).`)
} else {
    console.log('Typecheck passed with no warnings.')
}
