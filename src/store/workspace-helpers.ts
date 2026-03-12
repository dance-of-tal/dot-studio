import { buildPerformerConfigHash } from '../lib/performers'

export function normalizePath(dir: string): string {
    return dir.trim().replace(/\/+$/, '')
}

export function getMaxPerformerCounter(performers: Array<{ id: string }>): number {
    return performers.reduce((max, performer) => {
        const match = performer.id.match(/^performer-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

export function getMaxMarkdownEditorCounter(editors: Array<{ id: string }>): number {
    return editors.reduce((max, editor) => {
        const match = editor.id.match(/^markdown-editor-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

export function defaultMarkdownContent(_kind: 'tal' | 'dance') {
    return ''
}

export function applyPerformerPatch<T extends Record<string, any>>(performer: any, patch: T) {
    const mutatesPublishIdentity = (
        'name' in patch
        || 'talRef' in patch
        || 'danceRefs' in patch
        || 'model' in patch
        || 'modelPlaceholder' in patch
        || 'mcpServerNames' in patch
        || 'declaredMcpConfig' in patch
        || 'danceDeliveryMode' in patch
    ) && (patch.meta?.publishBindingUrn === undefined)

    const next = {
        ...performer,
        ...patch,
    }
    if (mutatesPublishIdentity) {
        next.meta = {
            ...performer.meta,
            ...patch.meta,
            publishBindingUrn: null,
        }
    }
    next.configHash = buildPerformerConfigHash(next)
    return next
}

export function mapPerformers(
    performers: any[],
    performerId: string,
    updater: (performer: any) => any,
) {
    return performers.map((performer) => (
        performer.id === performerId
            ? updater(performer)
            : performer
    ))
}

export function mapCanvasTerminals(
    canvasTerminals: Array<{ id: string }>,
    id: string,
    updater: (terminal: any) => any,
) {
    return canvasTerminals.map((terminal) => (
        terminal.id === id
            ? updater(terminal)
            : terminal
    ))
}

export function mapMarkdownEditors(
    markdownEditors: Array<{ id: string }>,
    id: string,
    updater: (editor: any) => any,
) {
    return markdownEditors.map((editor) => (
        editor.id === id
            ? updater(editor)
            : editor
    ))
}
