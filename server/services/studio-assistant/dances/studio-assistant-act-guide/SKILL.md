---
name: studio-assistant-act-guide
description: Explains the current DOT Studio Act contract and safe relation design. Use when the user asks about Act choreography, participant keys, relation direction, or publish-safe workflow structure.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Act Contract Guide

Use this skill when the user is asking about Act structure, relation design, or contract-correct choreography.

## Mental Model
- An Act is participant choreography.
- Workspace Acts, canonical Act assets, runtime Act definitions, and thread runtime state are different layers.
- Assistant mutations operate on the Studio workspace layer, but should still aim for publishable Act structure.

## Current Contract Facts
- Participants are keyed records in Studio workspace state.
- Canonical Act assets use participant `key` plus performer URN, not workspace `performerRef`.
- Participant subscriptions use `messagesFrom`, `messageTags`, `callboardKeys`, and `eventTypes`.
- `eventTypes` currently only supports `runtime.idle`.
- Relations use `between: [sourceKey, targetKey]`, `direction`, `name`, and `description`.
- For `one-way`, relation order matters.
- Opposite one-way relations are valid as separate relations.

## Design Rules
- If an Act has multiple participants, it should also have at least one relation.
- The Act composition should match the user's requested team shape, workflow, and role split.
- For workflow or team requests, a participant-only Act is usually incomplete and should be treated as wrong unless the user explicitly asked for an unconnected group.
- If the user asks for something like a `d2c company`, `investment team`, or `review workflow`, create the Act with participants and relations in the same `createAct` action.
- For a brand-new Act whose participants are already known, prefer one `createAct` with `participantPerformerRefs`, `participantPerformerIds`, or `participantPerformerNames` instead of follow-up attach actions.
- Use `attachPerformerToAct` mainly when extending an existing Act.
- If the Act needs missing participants, create the missing Performers first in cascade and make sure those Performers also match the user intent.
- Always give each new relation both a clear `name` and `description`.
- Use `sourceParticipantKey` / `sourcePerformerId` / `sourcePerformerRef` / `sourcePerformerName` and the matching `target...` fields for new relations.
- Do not generate `from...` or `to...` relation field names.
- Treat subscriptions as wake-up filters, not permissions.
- Use `actRules` for whole-Act instructions that every participant should see.
- Use `callboardKeys` as the field name even if the UI describes the same surface as shared board or shared notes.
- Prefer focused Acts over one giant workflow graph.
- Reuse existing performers when they already match the requested role.
- Avoid promising legacy relation metadata or runtime-only fields unless the current assistant action surface can actually express them.

## Self-Check
- End with exactly one raw `<assistant-actions>...</assistant-actions>` block.
- Do not emit bare JSON or fenced JSON for mutations.
- For non-trivial mutation blocks, run `node scripts/typecheck-assistant-actions.mjs <path-or->` before applying or presenting the final block.
- If the new Act has multiple participants and represents a workflow/team, include at least one relation.
- Every new relation must include source, target, direction, name, and description.
- The cascaded Performers and the final Act structure both reflect the user's requested intent.

## Asset Dialog
- For new Act design requests, it is good to use a short question-and-answer flow when the participant split or workflow handoff is still unclear.
- Ask only the smallest questions needed to determine who should participate, what each role does, and how handoff should work.

Example:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"brand","name":"Brand Strategist"},{"type":"createPerformer","ref":"growth","name":"Growth Marketer"},{"type":"createPerformer","ref":"ops","name":"Ecommerce Operator"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["brand","growth","ops"],"relations":[{"sourcePerformerRef":"brand","targetPerformerRef":"growth","direction":"one-way","name":"campaign brief","description":"Brand Strategist hands positioning and campaign priorities to Growth Marketer."},{"sourcePerformerRef":"growth","targetPerformerRef":"ops","direction":"one-way","name":"launch handoff","description":"Growth Marketer hands launch requirements and expected volume to Ecommerce Operator."}]}]}</assistant-actions>
```

## Legacy Fields To Avoid
- participant `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`
