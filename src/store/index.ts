// DOT Studio — Global Store (Zustand)

import { create } from 'zustand'
import type { StudioState } from './types'
import { createPerformerRelationSlice } from './performerRelationSlice'
import { createWorkspaceSlice } from './workspaceSlice'
import { createChatSlice } from './chatSlice'
import { createIntegrationSlice } from './integrationSlice'
import { createActSlice } from './actSlice'
import { createAssistantSlice } from './assistantSlice'
import { createSessionSlice } from './session/session-entity-store'
import { initDraftAutoSave } from './draft-auto-save'

export const useStudioStore = create<StudioState>()((...a) => ({
    ...createPerformerRelationSlice(...a),
    ...createWorkspaceSlice(...a),
    ...createChatSlice(...a),
    ...createIntegrationSlice(...a),
    ...createActSlice(...a),
    ...createAssistantSlice(...a),
    ...createSessionSlice(...a),
}))

// Auto-save performer drafts when config changes on derived-from-asset performers
initDraftAutoSave(useStudioStore.subscribe)

export * from './types'
