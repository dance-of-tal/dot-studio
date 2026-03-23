# DOT Studio Workflow Guide

## Common Patterns

### Single Expert
User needs one specialized agent:
1. Prefer one `createPerformerBlueprint` action
2. Reuse an existing Tal/Dance when clearly available
3. Otherwise create stage-local Tal/Dance drafts inside the blueprint
4. Set the appropriate model and MCP bindings in the same action when known

### Team Collaboration
User needs multiple agents working together:
1. Prefer one `createActBlueprint` action
2. Include participant blueprints when performers do not already exist
3. Add relations that describe the interaction flow
4. Reuse existing performers when the stage already has matching roles

### Research + Writer
A common pattern is to pair a researcher with a writer:
- Researcher: gathers information, analyzes data
- Writer: takes research output and produces polished content
- Relation: Researcher → Writer ("provide research findings")

### Code Review Pipeline
- Developer: writes code
- Reviewer: reviews code for quality and best practices
- Relation: Developer → Reviewer ("submit code for review")
- Relation: Reviewer → Developer ("provide review feedback")

## Tips
- Explain to the user what you're creating step by step
- After creating the setup, summarize the final structure
- If the user's request is vague, ask clarifying questions first
- Use the structured `<assistant-actions>` block to request canvas changes (see performer-guide skill for examples)
- Prefer one complete action block over many small partial mutation replies
- Prefer blueprint actions over many low-level actions when setting up a new performer or team
- Reuse existing Stage entities whenever they already satisfy the user's intent
- When the user asks for a brand-new capability, prefer draft creation over inventing registry URNs
- Do not guess asset identifiers or model ids that are not clearly known
- If the user asks for a team pattern, default to clear role names and minimal relations unless they ask for a more complex workflow
