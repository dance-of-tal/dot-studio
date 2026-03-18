import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Create an interaction connection (relation/edge) from one Performer to another inside an Act. This allows the source to call the target.',
  parameters: z.object({
    actId: z.string().describe('The ID of the Act containing both performers'),
    sourcePerformerId: z.string().describe('The ID of the source Performer initiating the call (caller)'),
    targetPerformerId: z.string().describe('The ID of the target Performer answering the call (callee)'),
    description: z.string().describe('A brief description of what the relation is for (e.g. "ask for code review")')
  }),
  execute: async ({ actId, sourcePerformerId, targetPerformerId, description }) => {
    return {
      type: 'pending_canvas_action',
      action: 'connectPerformers',
      payload: { actId, sourcePerformerId, targetPerformerId, description }
    }
  }
})