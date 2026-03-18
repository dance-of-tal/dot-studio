import { tool } from '@opencode-ai/sdk'
import { z } from 'zod'

export default tool({
  description: 'Connect an MCP server to a Performer, giving it access to external tools.',
  parameters: z.object({
    performerId: z.string().describe('The ID of the Performer'),
    mcpServerName: z.string().describe('The name of the MCP server as configured in the project')
  }),
  execute: async ({ performerId, mcpServerName }) => {
    return { type: 'pending_canvas_action', action: 'addPerformerMcp', payload: { performerId, mcpServerName } }
  }
})