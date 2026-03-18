import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Query and summarize the current canvas state. Canvas context is provided in each message, but use this to explicitly reference the current setup.',
  parameters: z.object({
    reason: z.string().describe('Why you are checking the canvas state')
  }),
  execute: async ({ reason }) => {
    return { type: 'canvas_query', action: 'listCanvasState', reason }
  }
})