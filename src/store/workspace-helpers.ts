import type { CanvasTerminalNode, MarkdownEditorNode, PerformerNode } from '../types'

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

export function defaultMarkdownContent(kind: 'tal' | 'dance') {
    return kind === 'tal' ? '' : ''
}

type PerformerPatch = Partial<Omit<PerformerNode, 'meta'>> & {
    meta?: Partial<NonNullable<PerformerNode['meta']>>
}

export function applyPerformerPatch<T extends PerformerPatch>(performer: PerformerNode, patch: T): PerformerNode {
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
    return next
}

export function mapPerformers(
    performers: PerformerNode[],
    performerId: string,
    updater: (performer: PerformerNode) => PerformerNode,
): PerformerNode[] {
    return performers.map((performer) => (
        performer.id === performerId
            ? updater(performer)
            : performer
    ))
}

export function mapCanvasTerminals(
    canvasTerminals: CanvasTerminalNode[],
    id: string,
    updater: (terminal: CanvasTerminalNode) => CanvasTerminalNode,
): CanvasTerminalNode[] {
    return canvasTerminals.map((terminal) => (
        terminal.id === id
            ? updater(terminal)
            : terminal
    ))
}

export function mapMarkdownEditors(
    markdownEditors: MarkdownEditorNode[],
    id: string,
    updater: (editor: MarkdownEditorNode) => MarkdownEditorNode,
): MarkdownEditorNode[] {
    return markdownEditors.map((editor) => (
        editor.id === id
            ? updater(editor)
            : editor
    ))
}
