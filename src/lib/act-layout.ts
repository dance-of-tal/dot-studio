import ELK from 'elkjs/lib/elk.bundled.js'
import type { StageAct } from '../types'

export const ACT_LAYOUT_NODE_WIDTH = 180
export const ACT_LAYOUT_NODE_HEIGHT = 48

const ACT_LAYOUT_PADDING = {
    top: 32,
    right: 40,
    bottom: 32,
    left: 32,
}

const elk = new ELK()

export type ActAutoLayoutResult = {
    positions: Record<string, { x: number; y: number }>
    bounds: {
        width: number
        height: number
    }
}

export async function computeActAutoLayout(act: Pick<StageAct, 'bounds' | 'nodes' | 'edges'>): Promise<ActAutoLayoutResult> {
    if (act.nodes.length === 0) {
        return {
            positions: {},
            bounds: {
                width: act.bounds.width,
                height: act.bounds.height,
            },
        }
    }

    const validNodeIds = new Set(act.nodes.map((node) => node.id))
    const edges = act.edges.filter((edge) => (
        validNodeIds.has(edge.from)
        && edge.to !== '$exit'
        && validNodeIds.has(edge.to)
    ))

    const graph = await elk.layout({
        id: 'act-layout',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.padding': `[top=${ACT_LAYOUT_PADDING.top},left=${ACT_LAYOUT_PADDING.left},bottom=${ACT_LAYOUT_PADDING.bottom},right=${ACT_LAYOUT_PADDING.right}]`,
            'elk.spacing.nodeNode': '56',
            'elk.layered.spacing.nodeNodeBetweenLayers': '96',
            'elk.separateConnectedComponents': 'true',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        },
        children: act.nodes.map((node) => ({
            id: node.id,
            width: ACT_LAYOUT_NODE_WIDTH,
            height: ACT_LAYOUT_NODE_HEIGHT,
        })),
        edges: edges.map((edge) => ({
            id: edge.id || `${edge.from}:${edge.to}`,
            sources: [edge.from],
            targets: [edge.to],
        })),
    })

    const children = graph.children || []
    const positions = Object.fromEntries(
        children.map((node) => [
            node.id,
            {
                x: Math.round(node.x || 0),
                y: Math.round(node.y || 0),
            },
        ]),
    )

    const width = Math.max(
        act.bounds.width,
        Math.ceil(Math.max(...children.map((node) => (node.x || 0) + (node.width || ACT_LAYOUT_NODE_WIDTH))) + ACT_LAYOUT_PADDING.right),
    )
    const height = Math.max(
        act.bounds.height,
        Math.ceil(Math.max(...children.map((node) => (node.y || 0) + (node.height || ACT_LAYOUT_NODE_HEIGHT))) + ACT_LAYOUT_PADDING.bottom),
    )

    return {
        positions,
        bounds: {
            width,
            height,
        },
    }
}
