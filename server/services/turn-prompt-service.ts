export function joinPromptSections(
    sections: Array<string | null | undefined>,
): string | undefined {
    const normalized = sections
        .map((section) => (typeof section === 'string' ? section.trim() : ''))
        .filter((section) => section.length > 0)

    if (normalized.length === 0) {
        return undefined
    }

    return normalized.join('\n\n---\n\n')
}

export function buildTextPromptParts(
    text: string,
): Array<{ type: 'text'; text: string }> {
    return [{ type: 'text', text }]
}
