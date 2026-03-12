// DOT Studio — Global Store (Zustand)

import { create } from 'zustand'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspaceSlice'
import { createChatSlice } from './chatSlice'
import { createIntegrationSlice } from './integrationSlice'

export const useStudioStore = create<StudioState>()((...a) => ({
    ...createWorkspaceSlice(...a),
    ...createChatSlice(...a),
    ...createIntegrationSlice(...a),
}))

export * from './types'
