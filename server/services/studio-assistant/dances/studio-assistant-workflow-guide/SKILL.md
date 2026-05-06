---
name: studio-assistant-workflow-guide
description: "Helps design performer teams, role splits, handoff patterns, and connected Act topology in DOT Studio. Use when the user wants a team, workflow, pipeline, role decomposition, or Act structure recommendation."
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# DOT Studio Workflow Guide

Use this skill when the user wants help designing a Performer team or workflow shape.

## Build Strategy
- Reuse existing Performers when they already satisfy the role.
- Create only missing Performers, then create or update the Act.
- If the user asked for a workflow or team, do not stop after creating loose Performers.
- When new participants are created in the same reply, prefer `participantPerformerRefs` directly on `createAct`.
- Keep dependent actions in cascade order: create Performers, then create/update Act, then optional relation/subscription updates.
- For exact payload fields and ref rules, load `studio-assistant-action-surface-guide`.

## Role Split Heuristics
- Prefer small, legible role splits over large generic teams.
- Give each Performer a distinct responsibility and a clear output or handoff.
- If one Performer can plausibly solve the request, say so instead of forcing an Act.
- If the workflow has stages, mirror those stages in relation order.
- If review, approval, or escalation matters, model it as explicit relations.
- Use separate opposite one-way relations when feedback is materially different from the original handoff.

## Relation Heuristics
- Relation direction should match the actual flow of deliverables, decisions, approval, or escalation.
- Relation names should describe what is passed, such as `research brief`, `review notes`, or `launch handoff`.
- Add participant subscriptions only for concrete wake behavior.
- Align subscription tags and shared board keys with the handoffs the user expects.
- For contract field details, load `studio-assistant-act-guide`.

## Common Patterns
- Single expert: one Performer with a clear role.
- Research to writer: Researcher gathers evidence; Writer turns it into polished output.
- Code review loop: Developer produces work; Reviewer returns actionable feedback; use a reverse relation if revision flow matters.
- Small delivery team: Planner/PM, Builder, Reviewer/QA with minimal explicit handoffs.

## Response Strategy
- State the intended structure briefly.
- Ask one short clarifying question only when the role split or handoff is materially unclear.
- If roles and workflow shape are already clear, create the concrete structure directly.
- Do not ignore a role the user explicitly requested.
- Do not add Tal, Dance, model, or MCP choices the user explicitly asked to omit.

## Anti-Patterns
- Generic Performers with overlapping jobs.
- Unconnected multi-participant Acts for workflow requests.
- One giant graph when a focused Act would do.
- Invented registry assets, MCP names, model ids, or variant ids.
