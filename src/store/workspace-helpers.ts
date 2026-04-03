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

const SPAWN_STACK_OFFSETS = [
    { x: 0, y: 0 },
    { x: 36, y: 28 },
    { x: 72, y: 56 },
    { x: 108, y: 84 },
    { x: -36, y: 28 },
    { x: 36, y: -28 },
]

export function resolveCanvasSpawnPosition(input: {
    canvasCenter: { x: number; y: number } | null
    existingCount: number
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
}) {
    const anchor = input.canvasCenter || input.fallbackCenter || {
        x: (input.width / 2) + 60,
        y: (input.height / 2) + 60,
    }
    const offset = SPAWN_STACK_OFFSETS[Math.max(0, input.existingCount) % SPAWN_STACK_OFFSETS.length] || SPAWN_STACK_OFFSETS[0]
    const centerOffset = input.centerOffset || { x: 0, y: 0 }

    return {
        x: Math.round(anchor.x + centerOffset.x - (input.width / 2) + offset.x),
        y: Math.round(anchor.y + centerOffset.y - (input.height / 2) + offset.y),
    }
}

export function resolveCanvasCenterPosition(
    canvasElement: HTMLDivElement,
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number },
) {
    const rect = canvasElement.getBoundingClientRect()
    const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    })

    return {
        x: Math.round(center.x),
        y: Math.round(center.y),
    }
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

export function removeMarkdownEditorsByDraftIds(
    markdownEditors: MarkdownEditorNode[],
    draftIds: string[],
): MarkdownEditorNode[] {
    if (draftIds.length === 0) return markdownEditors
    const removed = new Set(draftIds)
    return markdownEditors.filter((editor) => !removed.has(editor.draftId))
}
