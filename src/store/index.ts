// DOT Studio — Global Store (Zustand)

import { create } from 'zustand'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspaceSlice'
import { createChatSlice } from './chatSlice'
import { createIntegrationSlice } from './integrationSlice'
import { createAdapterViewSlice } from './adapterViewSlice'
import { createSafeModeSlice } from './safeModeSlice'

export const useStudioStore = create<StudioState>()((...a) => ({
    ...createWorkspaceSlice(...a),
    ...createChatSlice(...a),
    ...createIntegrationSlice(...a),
    ...createAdapterViewSlice(...a),
    ...createSafeModeSlice(...a),
}))

export * from './types'
