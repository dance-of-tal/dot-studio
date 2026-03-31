# DOT Studio Workflow Guide

Use this skill when the user wants help designing a performer team or workflow shape.

## Default Build Strategy
- Reuse existing performers whenever they already satisfy the role.
- Create only the missing performers, then create or update the Act.
- Prefer one complete mutation pass over many partial follow-ups.
- When a capability is new and no known registry asset is present, prefer local Tal or Dance drafts over invented URNs.

## Common Patterns

### Single Expert
- One performer with a clear role name
- Add model, Tal, Dances, and MCP only when explicitly known

### Research -> Writer
- Researcher gathers and structures findings
- Writer turns findings into polished output
- Relation should include a concrete name and description

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
- When Tal, Dance, or Performer setup can be done in more than one reasonable way, present the shortest useful option set first.
- If the request is specific enough, create the concrete performer and Act structure directly.
