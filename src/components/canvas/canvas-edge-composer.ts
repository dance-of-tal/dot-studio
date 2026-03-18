import type { Edge } from '@xyflow/react'
import type { StageAct } from '../../types'
import { buildActLayoutEdges } from './act-layout-helpers'

export function composeCanvasEdges(isActLayoutMode: boolean, layoutAct: StageAct | null) {
    if (!isActLayoutMode || !layoutAct) {
        return [] satisfies Edge[]
    }

    return buildActLayoutEdges(layoutAct)
}
