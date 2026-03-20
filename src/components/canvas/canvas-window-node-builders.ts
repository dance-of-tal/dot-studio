import type { Node } from '@xyflow/react'
import type {
    CanvasTerminalNode,
    CanvasTrackingWindow,
    DraftAsset,
    MarkdownEditorNode,
    PerformerNode,
    StageAct,
} from '../../types'
import {
    ACT_DEFAULT_WIDTH,
    resolveActExpandedHeight,
} from '../../lib/act-layout'
import { hasModelConfig } from '../../lib/performers'

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act'

function getCanvasWindowZIndex({
    selected = false,
    focused = false,
    editing = false,
    transformActive = false,
}: {
    selected?: boolean
    focused?: boolean
    editing?: boolean
    transformActive?: boolean
}) {
    if (transformActive) return 80
    if (editing) return 70
    if (focused) return 60
    if (selected) return 50
    return 1
}

function assetRefLabel(
    ref: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined,
    drafts: Record<string, DraftAsset>,
) {
    if (!ref) {
        return null
    }
    if (ref.kind === 'draft') {
        const draft = drafts[ref.draftId]
        return draft?.name || draft?.slug || `Draft · ${ref.draftId.slice(0, 8)}`
    }
    return ref.urn.split('/').pop() || ref.urn
}

function danceSummaryLabel(
    refs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
    drafts: Record<string, DraftAsset>,
) {
    if (refs.length === 0) {
        return null
    }

    const labels = refs
        .map((ref) => assetRefLabel(ref, drafts))
        .filter((label): label is string => !!label)

    if (labels.length === 0) {
        return `${refs.length} dance${refs.length === 1 ? '' : 's'}`
    }

    return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]
}

export function buildPerformerCanvasNodes(args: {
    acts: StageAct[]
    editingActId: string | null
    performers: PerformerNode[]
    selectedPerformerId: string | null
    focusedPerformerId: string | null
    editingTarget: { type: string; id: string } | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    drafts: Record<string, DraftAsset>
    performerMcpSummary: (performer: PerformerNode) => string | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        acts,
        editingActId,
        performers,
        selectedPerformerId,
        focusedPerformerId,
        editingTarget,
        transformTarget,
        drafts,
        performerMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    const editingAct = editingActId
        ? acts.find((act) => act.id === editingActId) || null
        : null

    const isPerformerInEditingAct = (performer: PerformerNode) => {
        if (!editingAct) return false
        return Object.values(editingAct.participants).some((binding) => {
            const ref = binding.performerRef
            if (ref.kind === 'draft') {
                return ref.draftId === performer.id
            }
            return performer.meta?.derivedFrom === ref.urn
        })
    }

    return performers.map((performer) => ({
        id: performer.id,
        type: 'performer',
        position: performer.position,
        selected: performer.id === selectedPerformerId,
        dragHandle: '.canvas-frame__header',
        hidden: performer.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: performer.id === selectedPerformerId,
            focused: focusedPerformerId === performer.id,
            editing: editingTarget?.type === 'performer' && editingTarget.id === performer.id,
            transformActive: transformTarget?.type === 'performer' && transformTarget.id === performer.id,
        }),
        data: {
            name: performer.name,
            width: performer.width,
            height: performer.height,
            model: performer.model,
            modelLabel: performer.model?.modelId || null,
            modelTitle: performer.model ? `${performer.model.provider}/${performer.model.modelId}` : null,
            modelVariant: performer.modelVariant || null,
            agentId: performer.agentId || null,
            modelConfigured: hasModelConfig(performer.model),
            planMode: performer.planMode,
            transformActive: transformTarget?.type === 'performer' && transformTarget.id === performer.id,
            onActivateTransform: () => onActivateTransform('performer', performer.id),
            onDeactivateTransform: () => onDeactivateTransform('performer', performer.id),
            talLabel: assetRefLabel(performer.talRef, drafts),
            danceSummary: danceSummaryLabel(performer.danceRefs, drafts),
            mcpSummary: performerMcpSummary(performer),
            editMode: editingTarget?.type === 'performer' && editingTarget.id === performer.id,
            actEditConnectVisible: !!editingAct,
            actEditParticipant: isPerformerInEditingAct(performer),
            actEditDimmed: !!editingAct && !isPerformerInEditingAct(performer),
        } as Record<string, unknown>,
    })) satisfies Node[]
}

export function buildMarkdownEditorCanvasNodes(args: {
    markdownEditors: MarkdownEditorNode[]
    selectedMarkdownEditorId: string | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    workingDir: string
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    return markdownEditors.map((editor) => ({
        id: editor.id,
        type: 'markdownEditor',
        position: editor.position,
        selected: editor.id === selectedMarkdownEditorId,
        dragHandle: '.canvas-frame__header',
        hidden: editor.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: editor.id === selectedMarkdownEditorId,
            editing: selectedMarkdownEditorId === editor.id,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
        }),
        data: {
            kind: editor.kind,
            draftId: editor.draftId,
            baseline: editor.baseline,
            attachTarget: editor.attachTarget,
            width: editor.width,
            height: editor.height,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
            onActivateTransform: () => onActivateTransform('markdownEditor', editor.id),
            onDeactivateTransform: () => onDeactivateTransform('markdownEditor', editor.id),
            workingDir,
        } as Record<string, unknown>,
    })) satisfies Node[]
}

export function buildCanvasTerminalWindowNodes(args: {
    canvasTerminals: CanvasTerminalNode[]
    transformTarget: { id: string; type: CanvasNodeKind } | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
    onCloseTerminal: (id: string) => void
    onResizeTerminal: (id: string, width: number, height: number) => void
    onSessionChange: (id: string, sessionId: string | null, connected: boolean) => void
}) {
    const {
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    } = args

    return canvasTerminals.map((terminal) => ({
        id: terminal.id,
        type: 'canvasTerminal',
        position: terminal.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
        }),
        data: {
            nodeId: terminal.id,
            title: terminal.title,
            width: terminal.width,
            height: terminal.height,
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
            onActivateTransform: () => onActivateTransform('canvasTerminal', terminal.id),
            onDeactivateTransform: () => onDeactivateTransform('canvasTerminal', terminal.id),
            onClose: () => onCloseTerminal(terminal.id),
            onResize: (width: number, height: number) => onResizeTerminal(terminal.id, width, height),
            onSessionChange: (sessionId: string | null, connected: boolean) => onSessionChange(terminal.id, sessionId, connected),
        } as Record<string, unknown>,
    })) satisfies Node[]
}

export function buildTrackingWindowNodes(args: {
    trackingWindow: CanvasTrackingWindow | null | undefined
    transformTarget: { id: string; type: CanvasNodeKind } | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
    onCloseTrackingWindow: () => void
    onResizeTrackingWindow: (width: number, height: number) => void
}) {
    const {
        trackingWindow,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTrackingWindow,
        onResizeTrackingWindow,
    } = args

    return trackingWindow ? [{
        id: trackingWindow.id,
        type: 'stageTracking',
        position: trackingWindow.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            transformActive: transformTarget?.type === 'stageTracking' && transformTarget.id === trackingWindow.id,
        }),
        data: {
            title: trackingWindow.title,
            width: trackingWindow.width,
            height: trackingWindow.height,
            transformActive: transformTarget?.type === 'stageTracking' && transformTarget.id === trackingWindow.id,
            onActivateTransform: () => onActivateTransform('stageTracking', trackingWindow.id),
            onDeactivateTransform: () => onDeactivateTransform('stageTracking', trackingWindow.id),
            onClose: () => onCloseTrackingWindow(),
            onResize: (width: number, height: number) => onResizeTrackingWindow(width, height),
        } as Record<string, unknown>,
    }] satisfies Node[] : []
}

export function buildActCanvasNodes(args: {
    acts: StageAct[]
    editingActId: string | null
    selectedActId: string | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        acts,
        editingActId,
        selectedActId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    return acts.map((act) => ({
        id: act.id,
        type: 'act' as const,
        position: act.position,
        dragHandle: '.canvas-frame__header',
        hidden: act.hidden,
        zIndex: getCanvasWindowZIndex({
            editing: editingActId === act.id,
            selected: selectedActId === act.id,
            transformActive: transformTarget?.type === 'act' && transformTarget.id === act.id,
        }),
        data: {
            width: act.width || ACT_DEFAULT_WIDTH,
            height: resolveActExpandedHeight(act.height),
            editMode: editingActId === act.id,
            transformActive: transformTarget?.type === 'act' && transformTarget.id === act.id,
            onActivateTransform: () => onActivateTransform('act', act.id),
            onDeactivateTransform: () => onDeactivateTransform('act', act.id),
        } as Record<string, unknown>,
    })) satisfies Node[]
}
