/**
 * act-session-policy.ts — Single source of truth for Act session execution rules.
 *
 * Act is a direct-only runtime.
 * All Act participant sessions — manual sends and auto-wake — use the same policy.
 */

/** Act sessions use 'act' as their session owner kind. */
export const ACT_OWNER_KIND = 'act' as const

/** Act scope for projection — always 'act', never 'workspace'. */
export const ACT_SCOPE = 'act' as const

/**
 * Act scope always uses the build agent, even when the underlying
 * performer has planMode enabled. Plan agent is meaningless in
 * the multi-participant Act context.
 */
export const ACT_AGENT_POSTURE = 'build' as const

/**
 * Resolve the canonical execution policy for an Act session.
 * Both manual Act chat and wake cascade must use this function
 * so the rules are defined in exactly one place.
 */
export function resolveActSessionPolicy(actId?: string) {
    void actId
    return {
        ownerKind: ACT_OWNER_KIND,
        scope: ACT_SCOPE,
        agentPosture: ACT_AGENT_POSTURE,
    } as const
}
