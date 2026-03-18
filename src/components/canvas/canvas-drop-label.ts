export function getCanvasDropLabel(activeKind: string | undefined, layoutActId: string | null) {
    if (activeKind !== 'performer') {
        return null
    }

    return layoutActId
        ? 'Drop to add this performer to the act layout'
        : 'Drop to add this performer to the current stage'
}
