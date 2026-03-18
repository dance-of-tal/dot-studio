import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Create a new Act on the Studio canvas. Acts are where Performers interact. Use this when the user needs a new workflow or a place to connect performers.',
  parameters: z.object({
    name: z.string().describe('The name of the Act to create'),
  }),
  execute: async ({ name }) => {
    return {
      type: 'pending_canvas_action',
      action: 'createAct',
      payload: { name }
    }
  }
})