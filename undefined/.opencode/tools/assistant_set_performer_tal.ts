import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Set or change the Tal (identity layer) for a Performer. A Tal defines the core behavior, rules, and personality. Use the asset URN from the asset library.',
  parameters: z.object({
    performerId: z.string().describe('The ID of the Performer'),
    talUrn: z.string().describe('The URN or draft ID of the Tal asset to assign')
  }),
  execute: async ({ performerId, talUrn }) => {
    return { type: 'pending_canvas_action', action: 'setPerformerTal', payload: { performerId, talUrn } }
  }
})