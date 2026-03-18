import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Add a Performer into an Act to allow them to participate in the workflow. Note: both Performer and Act must already exist.',
  parameters: z.object({
    performerId: z.string().describe('The ID of the Performer to add'),
    actId: z.string().describe('The ID of the Act to add the performer into'),
  }),
  execute: async ({ performerId, actId }) => {
    return {
      type: 'pending_canvas_action',
      action: 'addPerformerToAct',
      payload: { performerId, actId }
    }
  }
})