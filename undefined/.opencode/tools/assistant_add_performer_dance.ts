import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Add a Dance (skill knowledge) to a Performer. Dances provide domain-specific context.',
  parameters: z.object({
    performerId: z.string().describe('The ID of the Performer'),
    danceUrn: z.string().describe('The URN or draft ID of the Dance asset to add')
  }),
  execute: async ({ performerId, danceUrn }) => {
    return { type: 'pending_canvas_action', action: 'addPerformerDance', payload: { performerId, danceUrn } }
  }
})