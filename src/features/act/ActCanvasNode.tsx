import { useDroppable } from '@dnd-kit/core'
import { Bot, Flag, AlertTriangle, Split, X } from 'lucide-react'

type ActCanvasNodeView = {
    id: string
    type: 'worker' | 'orchestrator' | 'parallel'
    label: string
    position: { x: number; y: number }
    entry: boolean
}

type ActCanvasNodeProps = {
    actId: string
    node: ActCanvasNodeView
    focused: boolean
    orphaned: boolean
    allowGraphEditing: boolean
    awaitingTarget: boolean
    connectFromId: string | null
    onPointerDownMove: (nodeId: string, clientX: number, clientY: number, originX: number, originY: number) => void
    onClickNode: (nodeId: string) => void
    onConnectToNode: (toNodeId: string) => void
    onSetEntry: (nodeId: string) => void
    onToggleConnectFrom: (nodeId: string, clientX: number, clientY: number) => void
    onRemoveNode?: (nodeId: string) => void
}

export default function ActCanvasNode({
    actId,
    node,
    focused,
    orphaned,
    allowGraphEditing,
    awaitingTarget,
    connectFromId,
    onPointerDownMove,
    onClickNode,
    onConnectToNode,
    onSetEntry,
    onToggleConnectFrom,
    onRemoveNode,
}: ActCanvasNodeProps) {
    const typeLabel =
        node.type === 'orchestrator'
            ? 'Orchestrator'
            : node.type === 'parallel'
                ? 'Parallel'
                : 'Worker'

    const { isOver, setNodeRef } = useDroppable({
        id: `act-node-semantic-${actId}-${node.id}`,
        data: { type: 'act-node-semantic', actId, nodeId: node.id },
        disabled: !allowGraphEditing,
    })

    return (
        <div
            ref={setNodeRef}
            className={`act-area-node act-area-node--${node.type} ${node.entry ? 'act-area-node--entry' : ''} ${awaitingTarget ? 'act-area-node--target' : ''} ${focused ? 'act-area-node--focused' : ''} ${isOver ? 'act-area-node--semantic-over' : ''} ${orphaned ? 'act-area-node--orphaned' : ''}`}
            style={{
                left: node.position.x,
                top: node.position.y,
            }}
            title={node.label}
            onMouseDown={(event) => {
                if (!allowGraphEditing) {
                    return
                }
                const target = event.target as HTMLElement
                if (target.closest('.act-area-node__dot') || target.closest('.act-area-node__entry-btn') || target.closest('.act-area-node__delete-btn')) {
                    return
                }
                event.stopPropagation()
                onPointerDownMove(node.id, event.clientX, event.clientY, node.position.x, node.position.y)
            }}
            onClick={(event) => {
                if (allowGraphEditing) {
                    event.stopPropagation()
                    onClickNode(node.id)
                }
            }}
            onMouseUp={(event) => {
                if (!allowGraphEditing || !connectFromId || connectFromId === node.id) {
                    return
                }
                event.stopPropagation()
                onConnectToNode(node.id)
            }}
        >
            {/* Target dot (left edge) */}
            {allowGraphEditing ? (
                <div
                    className={`act-area-node__dot act-area-node__dot--target ${connectFromId && connectFromId !== node.id ? 'is-ready' : ''}`}
                    onMouseUp={(event) => {
                        event.stopPropagation()
                        if (connectFromId && connectFromId !== node.id) {
                            onConnectToNode(node.id)
                        }
                    }}
                    title={connectFromId && connectFromId !== node.id ? 'Drop to connect' : 'Target'}
                />
            ) : null}

            {/* Source dot (right edge) */}
            {allowGraphEditing ? (
                <div
                    className={`act-area-node__dot act-area-node__dot--source ${connectFromId === node.id ? 'is-active' : ''}`}
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onToggleConnectFrom(node.id, event.clientX, event.clientY)
                    }}
                    title={connectFromId === node.id ? 'Cancel' : 'Drag to connect'}
                />
            ) : null}

            {/* Entry badge (shown on hover for non-entry nodes) */}
            {allowGraphEditing && !node.entry ? (
                <button
                    type="button"
                    className="act-area-node__entry-btn"
                    onClick={(event) => {
                        event.stopPropagation()
                        onSetEntry(node.id)
                    }}
                    title="Set as entry"
                >
                    <Flag size={8} />
                    <span>Entry</span>
                </button>
            ) : null}

            {/* Delete button (shown on hover/focus for editing) */}
            {allowGraphEditing ? (
                <button
                    type="button"
                    className="act-area-node__delete-btn"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemoveNode?.(node.id)
                    }}
                    title="Remove node"
                >
                    <X size={8} />
                </button>
            ) : null}

            <span className="act-area-node__icon">
                {node.type === 'parallel' ? <Split size={10} /> : <Bot size={10} />}
            </span>
            <span className="act-area-node__content">
                <span className="act-area-node__label">{node.label}</span>
                <span className="act-area-node__meta">
                    <span className="act-area-node__type">{typeLabel}</span>
                    {node.entry ? <span className="act-area-node__type act-area-node__type--entry">Entry</span> : null}
                    {orphaned ? <span className="act-area-node__type act-area-node__type--orphaned" title="This node is not reachable from the entry node"><AlertTriangle size={8} /> Unreachable</span> : null}
                </span>
            </span>
        </div>
    )
}
