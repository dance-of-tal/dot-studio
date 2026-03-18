import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Before creating a complex setup, propose the plan to the user. Describe what performers, acts, and connections you will create. Wait for confirmation before proceeding.',
  parameters: z.object({
    useCase: z.string().describe('The user\'s use case or goal'),
    suggestedPerformers: z.array(z.object({ name: z.string(), role: z.string() })).describe('Suggested performers'),
    suggestedActs: z.array(z.string()).describe('Suggested Act names'),
    suggestedConnections: z.array(z.object({ from: z.string(), to: z.string(), description: z.string() })).describe('Suggested connections')
  }),
  execute: async ({ useCase, suggestedPerformers, suggestedActs, suggestedConnections }) => {
    return { type: 'suggestion', useCase, suggestedPerformers, suggestedActs, suggestedConnections }
  }
})