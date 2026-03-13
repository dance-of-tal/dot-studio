import { useDraggable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { Bot, Clock3, Flag, GitBranch, Network, Repeat, Split } from 'lucide-react'
import type { ActNodeType, ActSessionLifetime, ActSessionPolicy } from '../../types'

export type ActSemanticDragData =
    | { kind: 'act-semantic'; semanticType: 'entry' }
    | { kind: 'act-semantic'; semanticType: 'node-type'; value: ActNodeType }
    | { kind: 'act-semantic'; semanticType: 'session-policy'; value: ActSessionPolicy }
    | { kind: 'act-semantic'; semanticType: 'session-lifetime'; value: ActSessionLifetime }

type SemanticItem = {
    id: string
    group: 'entry' | 'role' | 'reuse' | 'lifetime'
    label: string
    description: string
    icon: ReactNode
    data: ActSemanticDragData
}

const SEMANTIC_ITEMS: SemanticItem[] = [
    {
        id: 'entry',
        group: 'entry',
        label: 'Entry',
        description: 'Mark the node as the thread entry.',
        icon: <Flag size={11} />,
        data: { kind: 'act-semantic', semanticType: 'entry' },
    },
    {
        id: 'worker',
        group: 'role',
        label: 'Worker',
        description: 'Runs a single LLM call and follows edges to the next node.',
        icon: <Bot size={11} />,
        data: { kind: 'act-semantic', semanticType: 'node-type', value: 'worker' },
    },
    {
        id: 'orchestrator',
        group: 'role',
        label: 'Orchestrator',
        description: 'Uses LLM to pick one route from connected targets.',
        icon: <GitBranch size={11} />,
        data: { kind: 'act-semantic', semanticType: 'node-type', value: 'orchestrator' },
    },
    {
        id: 'parallel',
        group: 'role',
        label: 'Parallel',
        description: 'Forks input to all branches and joins their results.',
        icon: <Split size={11} />,
        data: { kind: 'act-semantic', semanticType: 'node-type', value: 'parallel' },
    },
    {
        id: 'fresh',
        group: 'reuse',
        label: 'Fresh',
        description: 'No memory \u2014 starts fresh every time this node runs.',
        icon: <Repeat size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-policy', value: 'fresh' },
    },
    {
        id: 'node',
        group: 'reuse',
        label: 'Reuse Node',
        description: 'Remembers prior calls to this specific node.',
        icon: <Repeat size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-policy', value: 'node' },
    },
    {
        id: 'performer',
        group: 'reuse',
        label: 'Reuse Performer',
        description: 'Shares memory across all nodes using this performer.',
        icon: <Network size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-policy', value: 'performer' },
    },
    {
        id: 'act',
        group: 'reuse',
        label: 'Reuse Act',
        description: 'Single shared memory for the entire act run.',
        icon: <Network size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-policy', value: 'act' },
    },
    {
        id: 'run',
        group: 'lifetime',
        label: 'Run Lifetime',
        description: 'Memory resets when a new run starts.',
        icon: <Clock3 size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-lifetime', value: 'run' },
    },
    {
        id: 'thread',
        group: 'lifetime',
        label: 'Thread Lifetime',
        description: 'Memory persists across multiple runs in the same thread.',
        icon: <Clock3 size={11} />,
        data: { kind: 'act-semantic', semanticType: 'session-lifetime', value: 'thread' },
    },
]

const SEMANTIC_GROUPS: Array<{
    id: SemanticItem['group']
    title: string
    description: string
}> = [
        { id: 'entry', title: 'Entry', description: 'Choose where the act starts.' },
        { id: 'role', title: 'Node role', description: 'Set how the node behaves.' },
        { id: 'reuse', title: 'Session reuse', description: 'Control which memory scope is reused.' },
        { id: 'lifetime', title: 'Memory lifetime', description: 'Control how long node memory survives.' },
    ]

function DraggableSemanticItem({ item }: { item: SemanticItem }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `act-semantic-${item.id}`,
        data: {
            ...item.data,
            label: item.label,
        },
    })

    return (
        <button
            ref={setNodeRef}
            type="button"
            className={`act-semantics-palette__item ${isDragging ? 'is-dragging' : ''}`}
            style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
            {...listeners}
            {...attributes}
        >
            <span className="act-semantics-palette__item-icon">{item.icon}</span>
            <span className="act-semantics-palette__item-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
            </span>
        </button>
    )
}

export default function ActNodeSemanticsPalette() {
    return (
        <div className="act-semantics-palette">
            <div className="act-semantics-palette__header">
                <strong>Act semantics</strong>
                <span>Drag a semantic chip onto the selected node.</span>
            </div>
            {SEMANTIC_GROUPS.map((group) => {
                const items = SEMANTIC_ITEMS.filter((item) => item.group === group.id)
                return (
                    <section key={group.id} className="act-semantics-palette__section">
                        <div className="act-semantics-palette__section-head">
                            <strong>{group.title}</strong>
                            <span>{group.description}</span>
                        </div>
                        <div className="act-semantics-palette__grid">
                            {items.map((item) => (
                                <DraggableSemanticItem key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
