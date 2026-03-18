import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Use this to structure your explanation of a DOT Studio concept when the user asks about features.',
  parameters: z.object({
    feature: z.string().describe('The feature or concept being explained'),
    explanation: z.string().describe('A concise, clear explanation')
  }),
  execute: async ({ feature, explanation }) => {
    return { type: 'text_response', feature, explanation }
  }
})