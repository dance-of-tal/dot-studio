import type { WorkspaceAct } from '../../types'
import type { WorkspaceSlice, ActSlice } from '../../store/types'

export type WorkspaceExplorerEditingTarget = WorkspaceSlice['editingTarget']
export type WorkspaceExplorerAct = WorkspaceAct
export type WorkspaceExplorerActThread = ActSlice['actThreads'][string][number]
export type PerformerEditorFocus = Parameters<WorkspaceSlice['openPerformerEditor']>[1]
