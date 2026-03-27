/**
 * act-runtime-utils.ts — Shared utilities for Act runtime modules.
 */

/**
 * Safely extract a string value from an untyped payload record.
 */
export function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key]
    return typeof value === 'string' ? value : undefined
}
