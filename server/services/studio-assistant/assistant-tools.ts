export interface AssistantToolTemplate {
    name: string
    description: string
    content: string
}

export const createPerformerTool: AssistantToolTemplate = {
    name: 'assistant_create_performer',
    description: 'Create a new Performer on the canvas',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Create a new Performer on the Studio canvas. Use this when the user asks for a new agent, team member, or persona to participate in their AI team.',
  args: {
    name: tool.schema.string().describe('The name of the performer to create'),
  },
  async execute({ name }) {
    return {
      type: 'pending_canvas_action',
      action: 'createPerformer',
      payload: { name }
    }
  }
})`
}

export const createActTool: AssistantToolTemplate = {
    name: 'assistant_create_act',
    description: 'Create a new Act choreography on the canvas',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Create a new Act on the Studio canvas. Acts are where performers enter as participants and collaborate through relations. Use this when the user needs a new workflow or a place to connect performers.',
  args: {
    name: tool.schema.string().describe('The name of the Act to create'),
  },
  async execute({ name }) {
    return {
      type: 'pending_canvas_action',
      action: 'createAct',
      payload: { name }
    }
  }
})`
}

export const addPerformerToActTool: AssistantToolTemplate = {
    name: 'assistant_add_performer_to_act',
    description: 'Add an existing Performer to an Act as a participant',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Add a Performer into an Act as a participant. Note: both Performer and Act must already exist.',
  args: {
    performerId: tool.schema.string().describe('The ID of the Performer to add'),
    actId: tool.schema.string().describe('The ID of the Act to add the performer into'),
  },
  async execute({ performerId, actId }) {
    return {
      type: 'pending_canvas_action',
      action: 'addPerformerToAct',
      payload: { performerId, actId }
    }
  }
})`
}

export const connectPerformersTool: AssistantToolTemplate = {
    name: 'assistant_connect_performers',
    description: 'Create a relation between two participants inside an Act',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Create a relation from one participant to another inside an Act. This allows the source to call the target.',
  args: {
    actId: tool.schema.string().describe('The ID of the Act containing both performers'),
    sourcePerformerId: tool.schema.string().describe('The ID of the source Performer initiating the call (caller)'),
    targetPerformerId: tool.schema.string().describe('The ID of the target Performer answering the call (callee)'),
    description: tool.schema.string().describe('A brief description of what the relation is for (e.g. "ask for code review")')
  },
  async execute({ actId, sourcePerformerId, targetPerformerId, description }) {
    return {
      type: 'pending_canvas_action',
      action: 'connectPerformers',
      payload: { actId, sourcePerformerId, targetPerformerId, description }
    }
  }
})`
}

export const setPerformerModelTool: AssistantToolTemplate = {
    name: 'assistant_set_performer_model',
    description: 'Set or change the model of a Performer',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Set the AI LLM model for a Performer.',
  args: {
    performerId: tool.schema.string().describe('The ID of the Performer'),
    providerId: tool.schema.string().describe('The provider ID (e.g. "openai", "anthropic")'),
    modelId: tool.schema.string().describe('The model ID (e.g. "gpt-4o", "claude-3-5-sonnet")')
  },
  async execute({ performerId, providerId, modelId }) {
    return {
      type: 'pending_canvas_action',
      action: 'setPerformerModel',
      payload: { performerId, providerId, modelId }
    }
  }
})`
}

export const setPerformerTalTool: AssistantToolTemplate = {
    name: 'assistant_set_performer_tal',
    description: 'Assign a Tal (identity/instruction) to an existing Performer',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Set or change the Tal (identity layer) for a Performer. A Tal defines the core behavior, rules, and personality. Use the asset URN from the asset library.',
  args: {
    performerId: tool.schema.string().describe('The ID of the Performer'),
    talUrn: tool.schema.string().describe('The URN or draft ID of the Tal asset to assign')
  },
  async execute({ performerId, talUrn }) {
    return { type: 'pending_canvas_action', action: 'setPerformerTal', payload: { performerId, talUrn } }
  }
})`
}

export const addPerformerDanceTool: AssistantToolTemplate = {
    name: 'assistant_add_performer_dance',
    description: 'Add a Dance (skill/knowledge) to an existing Performer',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Add a Dance (skill knowledge) to a Performer. Dances provide domain-specific context.',
  args: {
    performerId: tool.schema.string().describe('The ID of the Performer'),
    danceUrn: tool.schema.string().describe('The URN or draft ID of the Dance asset to add')
  },
  async execute({ performerId, danceUrn }) {
    return { type: 'pending_canvas_action', action: 'addPerformerDance', payload: { performerId, danceUrn } }
  }
})`
}

export const addPerformerMcpTool: AssistantToolTemplate = {
    name: 'assistant_add_performer_mcp',
    description: 'Add an MCP server to an existing Performer',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Connect an MCP server to a Performer, giving it access to external tools.',
  args: {
    performerId: tool.schema.string().describe('The ID of the Performer'),
    mcpServerName: tool.schema.string().describe('The name of the MCP server as configured in the project')
  },
  async execute({ performerId, mcpServerName }) {
    return { type: 'pending_canvas_action', action: 'addPerformerMcp', payload: { performerId, mcpServerName } }
  }
})`
}

export const explainFeatureTool: AssistantToolTemplate = {
    name: 'assistant_explain_feature',
    description: 'Explain a DOT Studio feature or concept to the user',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Use this to structure your explanation of a DOT Studio concept when the user asks about features.',
  args: {
    feature: tool.schema.string().describe('The feature or concept being explained'),
    explanation: tool.schema.string().describe('A concise, clear explanation')
  },
  async execute({ feature, explanation }) {
    return { type: 'text_response', feature, explanation }
  }
})`
}

export const listCanvasStateTool: AssistantToolTemplate = {
    name: 'assistant_list_canvas_state',
    description: 'Return the current canvas state summary for context',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Query and summarize the current canvas state. Canvas context is provided in each message, but use this to explicitly reference the current setup.',
  args: {
    reason: tool.schema.string().describe('Why you are checking the canvas state')
  },
  async execute({ reason }) {
    return { type: 'canvas_query', action: 'listCanvasState', reason }
  }
})`
}

export const suggestSetupTool: AssistantToolTemplate = {
    name: 'assistant_suggest_setup',
    description: 'Suggest a canvas setup for a use case before creating it',
    content: `import { tool } from '@opencode-ai/plugin'

export default tool({
  description: 'Before creating a complex setup, propose the plan to the user. Describe what performers, acts, and connections you will create. Wait for confirmation before proceeding.',
  args: {
    useCase: tool.schema.string().describe("The user's use case or goal"),
    suggestedPerformers: tool.schema.array(tool.schema.object({ name: tool.schema.string(), role: tool.schema.string() })).describe('Suggested performers'),
    suggestedActs: tool.schema.array(tool.schema.string()).describe('Suggested Act names'),
    suggestedConnections: tool.schema.array(tool.schema.object({ from: tool.schema.string(), to: tool.schema.string(), description: tool.schema.string() })).describe('Suggested connections')
  },
  async execute({ useCase, suggestedPerformers, suggestedActs, suggestedConnections }) {
    return { type: 'suggestion', useCase, suggestedPerformers, suggestedActs, suggestedConnections }
  }
})`
}

export const BUILTIN_ASSISTANT_TOOLS = [
    createPerformerTool,
    createActTool,
    addPerformerToActTool,
    connectPerformersTool,
    setPerformerModelTool,
    setPerformerTalTool,
    addPerformerDanceTool,
    addPerformerMcpTool,
    explainFeatureTool,
    listCanvasStateTool,
    suggestSetupTool,
]
