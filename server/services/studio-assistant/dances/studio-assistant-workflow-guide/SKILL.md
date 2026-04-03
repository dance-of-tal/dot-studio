---
name: studio-assistant-workflow-guide
description: Helps design performer teams and workflow shapes in DOT Studio. Use when the user wants a team topology, role split, or Act structure recommendation.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# DOT Studio Workflow Guide

Use this skill when the user wants help designing a performer team or workflow shape.

## Default Build Strategy
- Reuse existing performers whenever they already satisfy the role.
- Create only the missing performers, then create or update the Act.
- The created Performers should reflect the user's requested role, responsibility, and working style rather than generic placeholders.
- If the user intent implies a Tal, Dance, or model choice, carry that into the cascaded Performer creation unless the user explicitly asked to omit it.
- When creating a new performer, prefer creating its Tal or Dance dependencies in the same block instead of leaving a partial performer behind.
- If the user asked for a workflow or team, do not stop after creating performers alone.
- If the new Act participants were created in the same reply, prefer `participantPerformerRefs` directly on `createAct`.
- Keep dependent actions in cascade order inside one block: create performers first, then create or update the Act, then any follow-up participant or relation mutations.
- For a new workflow Act with multiple participants, prefer adding at least one relation during `createAct`.
- Do not assume an unseen existing participant for a from-scratch team request. Either use snapshot ids that actually exist or create the missing performer in the same block.
- Prefer one complete mutation pass over many partial follow-up mutations.
- When a capability is new and no known registry asset is present, prefer local Tal or Dance drafts over invented URNs.

## Common Patterns

### Single Expert
- One performer with a clear role name
- Add model, Tal, Dances, and MCP only when explicitly known

### Research -> Writer
- Researcher gathers and structures findings
- Writer turns findings into polished output
- Relation should include a concrete `name` and `description`

### Code Review Loop
- Developer writes code
- Reviewer reviews and returns feedback
- If both directions are needed, create two separate one-way relations

### Small Delivery Team
- Planner or PM
- Builder
- Reviewer or QA
- Keep relations minimal and explicit

## Response Strategy
- State the intended structure briefly.
- If the request is underspecified, ask the smallest clarifying question needed.
- Asset creation can be conversational. Use a short question-and-answer flow when the correct Performer or Act shape depends on missing intent.
- When Tal, Dance, or Performer setup can be done in more than one reasonable way, present the shortest useful option set first.
- If the request is specific enough, create the concrete performer and Act structure directly.
- Before finalizing a non-trivial mutation block, run `node scripts/typecheck-assistant-actions.mjs <path-or->` so same-block refs, draft kinds, and missing workflow relations are checked first.
