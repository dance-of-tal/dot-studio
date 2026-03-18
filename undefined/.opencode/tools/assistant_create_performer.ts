import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Create a new Performer on the Studio canvas. Use this when the user asks for a new agent, team member, or persona to participate in their AI team.',
  parameters: z.object({
    name: z.string().describe('The name of the performer to create'),
  }),
  execute: async ({ name }) => {
    return {
      type: 'pending_canvas_action',
      action: 'createPerformer',
      payload: { name }
    }
  }
})