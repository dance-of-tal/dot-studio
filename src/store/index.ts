// DOT Studio — Global Store (Zustand)

import { create } from 'zustand'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspaceSlice'
import { createChatSlice } from './chatSlice'
import { createIntegrationSlice } from './integrationSlice'
import { createAdapterViewSlice } from './adapterViewSlice'

export const useStudioStore = create<StudioState>()((...a) => ({
    ...createWorkspaceSlice(...a),
    ...createChatSlice(...a),
    ...createIntegrationSlice(...a),
    ...createAdapterViewSlice(...a),
}))

export * from './types'
