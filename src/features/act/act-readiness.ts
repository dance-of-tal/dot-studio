/**
 * Act Readiness Evaluator
 *
 * Pure function that determines whether a workspace Act is runnable.
 * Used by all Act surfaces: inspector, frame header, sidebar, chat panel.
 */
import type { WorkspaceAct, PerformerNode } from '../../types'
import { hasModelConfig } from '../../lib/performers'

export type ActReadinessIssueSeverity = 'error' | 'warning'

export interface ActReadinessIssueFocus {
    mode: 'act' | 'participant' | 'relation'
    participantKey?: string
    relationId?: string
}

export interface ActReadinessIssue {
    code: string
    severity: ActReadinessIssueSeverity
    message: string
    focus?: ActReadinessIssueFocus
}

export interface ActReadinessResult {
    runnable: boolean
    issues: ActReadinessIssue[]
}

/**
 * Resolve the studio PerformerNode that backs a participant binding.
 * Returns null if no matching performer is found on the canvas.
 */
function resolvePerformer(
    performerRef: WorkspaceAct['participants'][string]['performerRef'],
    performers: PerformerNode[],
): PerformerNode | null {
    if (performerRef.kind === 'draft') {
        return performers.find((p) =>
            p.id === performerRef.draftId
            || p.meta?.derivedFrom === `draft:${performerRef.draftId}`,
        ) ?? null
    }
    return performers.find((p) => p.meta?.derivedFrom === performerRef.urn) ?? null
}

/**
 * Evaluate whether an Act is ready to create a thread and run.
 *
 * Produces a structured result so every surface can render the same
 * readiness state without duplicating validation logic.
 */
export function evaluateActReadiness(
    act: WorkspaceAct,
    performers: PerformerNode[],
): ActReadinessResult {
    const issues: ActReadinessIssue[] = []
    const participantKeys = Object.keys(act.participants)

    // ── 1. No participants ──────────────────────────────
    if (participantKeys.length === 0) {
        issues.push({
            code: 'no-participants',
            severity: 'error',
            message: 'No participants bound to this Act',
            focus: { mode: 'act' },
        })
    }

    // ── 2. Multiple participants with no relations ──────
    if (participantKeys.length > 1 && act.relations.length === 0) {
        issues.push({
            code: 'no-relations',
            severity: 'error',
            message: 'Multiple participants require at least one relation',
            focus: { mode: 'act' },
        })
    }

    // ── 3. Relation validation ──────────────────────────
    for (const relation of act.relations) {
        for (const endpoint of relation.between) {
            if (!participantKeys.includes(endpoint)) {
                issues.push({
                    code: 'unknown-relation-endpoint',
                    severity: 'error',
                    message: `Relation "${relation.name}" references unknown participant "${endpoint}"`,
                    focus: { mode: 'relation', relationId: relation.id },
                })
            }
        }
        // Relation must have a name
        if (!relation.name || relation.name.trim().length === 0) {
            issues.push({
                code: 'empty-relation-name',
                severity: 'warning',
                message: `A relation between "${relation.between[0]}" and "${relation.between[1]}" has no name`,
                focus: { mode: 'relation', relationId: relation.id },
            })
        }
    }

    // ── 4 & 5. Per-participant checks ───────────────────
    for (const key of participantKeys) {
        const binding = act.participants[key]

        // 4. Performer ref cannot resolve
        const performer = resolvePerformer(binding.performerRef, performers)
        if (!performer) {
            issues.push({
                code: 'unresolved-performer',
                severity: 'error',
                message: `Participant "${key}" has no matching performer on the canvas`,
                focus: { mode: 'participant', participantKey: key },
            })
            continue // skip model check if performer not found
        }

        // 5. Resolved performer has no model config
        if (!hasModelConfig(performer.model)) {
            issues.push({
                code: 'no-model-config',
                severity: 'error',
                message: `Participant "${key}" has no model configured`,
                focus: { mode: 'participant', participantKey: key },
            })
        }
    }

    // ── 6. Disconnected participants (warning only) ─────
    if (participantKeys.length > 1) {
        const connectedKeys = new Set<string>()
        for (const relation of act.relations) {
            connectedKeys.add(relation.between[0])
            connectedKeys.add(relation.between[1])
        }
        for (const key of participantKeys) {
            if (!connectedKeys.has(key)) {
                issues.push({
                    code: 'disconnected-participant',
                    severity: 'warning',
                    message: `Participant "${key}" is not connected by any relation`,
                    focus: { mode: 'participant', participantKey: key },
                })
            }
        }
    }

    // ── 7. Subscription validation ──────────────────────
    // Only warn if the participant's performer actually exists — the
    // "no matching performer" error is already sufficient otherwise.
    if (participantKeys.length > 1) {
        for (const key of participantKeys) {
            const binding = act.participants[key]

            // Skip if performer can't be resolved — already covered by check #4
            const performer = resolvePerformer(binding.performerRef, performers)
            if (!performer) continue

            const subs = binding.subscriptions

            // Validate messagesFrom references valid participant keys
            if (subs?.messagesFrom) {
                for (const fromKey of subs.messagesFrom) {
                    if (!participantKeys.includes(fromKey)) {
                        issues.push({
                            code: 'invalid-subscription-source',
                            severity: 'warning',
                            message: `Participant "${key}" subscribes to messages from unknown participant "${fromKey}"`,
                            focus: { mode: 'participant', participantKey: key },
                        })
                    }
                }
            }

            // Direct messages wake participants regardless of subscription
            // configuration. Only warn when the participant has explicit
            // subscription entries referencing unknown peers (already handled
            // by the 'invalid-subscription-source' check above).
        }
    }

    const hasErrors = issues.some((issue) => issue.severity === 'error')

    return {
        runnable: !hasErrors,
        issues,
    }
}
