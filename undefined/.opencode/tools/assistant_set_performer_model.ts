import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Set the AI LLM model for a Performer.',
  parameters: z.object({
    performerId: z.string().describe('The ID of the Performer'),
    providerId: z.string().describe('The provider ID (e.g. "openai", "anthropic")'),
    modelId: z.string().describe('The model ID (e.g. "gpt-4o", "claude-3-5-sonnet")')
  }),
  execute: async ({ performerId, providerId, modelId }) => {
    return {
      type: 'pending_canvas_action',
      action: 'setPerformerModel',
      payload: { performerId, providerId, modelId }
    }
  }
})