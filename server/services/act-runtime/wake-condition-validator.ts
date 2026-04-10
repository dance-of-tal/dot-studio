import type { ConditionExpr } from '../../../shared/act-types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export function validateConditionExpr(
    expr: unknown,
    path = 'condition',
): { ok: true; value: ConditionExpr } | { ok: false; error: string } {
    if (!isRecord(expr)) {
        return { ok: false, error: `${path} must be an object` }
    }

    const type = expr.type
    if (!isNonEmptyString(type)) {
        return { ok: false, error: `${path}.type must be a non-empty string` }
    }

    switch (type) {
        case 'all_of':
        case 'any_of': {
            if (!Array.isArray(expr.conditions)) {
                return { ok: false, error: `${path}.conditions must be an array` }
            }

            const conditions: ConditionExpr[] = []
            for (let index = 0; index < expr.conditions.length; index += 1) {
                const result = validateConditionExpr(expr.conditions[index], `${path}.conditions[${index}]`)
                if (!result.ok) {
                    return result
                }
                conditions.push(result.value)
            }

            return { ok: true, value: { type, conditions } }
        }

        case 'board_key_exists':
            if (!isNonEmptyString(expr.key)) {
                return { ok: false, error: `${path}.key must be a non-empty string` }
            }
            return { ok: true, value: { type, key: expr.key } }

        case 'message_received':
            if (!isNonEmptyString(expr.from)) {
                return { ok: false, error: `${path}.from must be a non-empty string` }
            }
            if (expr.tag !== undefined && !isNonEmptyString(expr.tag)) {
                return { ok: false, error: `${path}.tag must be a non-empty string when provided` }
            }
            return {
                ok: true,
                value: {
                    type,
                    from: expr.from,
                    ...(expr.tag !== undefined ? { tag: expr.tag } : {}),
                },
            }

        case 'wake_at':
            if (!isFiniteNumber(expr.at)) {
                return { ok: false, error: `${path}.at must be a finite number` }
            }
            return { ok: true, value: { type, at: expr.at } }

        default:
            return { ok: false, error: `${path}.type "${type}" is not supported` }
    }
}
