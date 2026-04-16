---
name: studio-assistant-act-guide
description: Explains the current DOT Studio Act contract, participant choreography, relation naming, subscriptions, actRules, and publish-safe workflow structure. Use when the user asks about Act design, multi-performer workflows, participant keys, relation direction, runtime guardrails, or subscription wiring.
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
- For a direct team/workflow creation request, do not stop after creating performers if the intended Act is already clear.
- Missing Tal details alone are not a reason to block a clear Act creation request. If the requested roles are clear, create the needed Performers first and then the Act.
- Use `attachPerformerToAct` mainly when extending an existing Act.
- If the Act needs missing participants, create the missing Performers first in cascade and make sure those Performers also match the user intent.
- Always give each new relation both a clear `name` and `description`.
- Linked performer `description` becomes participant focus in Act runtime, so keep it aligned with the participant's job.
- Use `sourceParticipantKey` / `sourcePerformerId` / `sourcePerformerRef` / `sourcePerformerName` and the matching `target...` fields for new relations.
- Do not generate `from...` or `to...` relation field names.
- Treat subscriptions as wake-up filters, not permissions.
- Use `actRules` for whole-Act instructions that every participant should see.
- Use `callboardKeys` as the field name even if the UI describes the same surface as shared board or shared notes.
- `safety` is the whole-Act runtime guardrail layer. It is different from participant `wait_until`.
- If you need to explain Act runtime waiting behavior, use `wait_until` conditions named `message_received`, `board_key_exists`, `wake_at`, `all_of`, and `any_of`.
- `wake_at` is the scheduled self-wake condition name. Do not call it `timeout`.
- Prefer focused Acts over one giant workflow graph.
- Reuse existing performers when they already match the requested role.
- Avoid promising legacy relation metadata or runtime-only fields unless the current assistant action surface can actually express them.

## Design Heuristics
- Put durable team-wide instructions in `actRules`, not in a relation description.
- Put each participant's job focus in the linked Performer `description`.
- Put runtime caps, loop limits, and timeout behavior in `safety`, not in relation metadata.
- Put wake filters in participant `subscriptions`, not in `actRules`.
- Keep relations concrete and legible. A good relation says who hands what to whom and why that handoff exists.
- For review, approval, or escalation flows, it is often better to model separate one-way relations than one vague bidirectional relation.

## Common Failure Patterns
- Creating multiple participants with no relations for a workflow request.
- Using generic relation labels like `handoff` without a meaningful description.
- Stuffing participant-specific behavior into `actRules` when it belongs on the Performer or participant subscription layer.
- Inventing legacy fields such as `permissions`, `timeout`, or participant `id`.

## Self-Check
- Use `apply_studio_actions` for mutations.
- Do not emit bare JSON or fenced JSON for mutations in the reply text.
- If the new Act has multiple participants and represents a workflow/team, include at least one relation.
- Every new relation must include source, target, direction, name, and description.
- The cascaded Performers and the final Act structure both reflect the user's requested intent.

## Asset Dialog
- For new Act design requests, it is good to use a short question-and-answer flow when the participant split or workflow handoff is still unclear.
- Ask only the smallest questions needed to determine who should participate, what each role does, and how handoff should work.

Example:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"brand","name":"Brand Strategist"},{"type":"createPerformer","ref":"growth","name":"Growth Marketer"},{"type":"createPerformer","ref":"ops","name":"Ecommerce Operator"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["brand","growth","ops"],"relations":[{"sourcePerformerRef":"brand","targetPerformerRef":"growth","direction":"one-way","name":"campaign brief","description":"Brand Strategist hands positioning and campaign priorities to Growth Marketer."},{"sourcePerformerRef":"growth","targetPerformerRef":"ops","direction":"one-way","name":"launch handoff","description":"Growth Marketer hands launch requirements and expected volume to Ecommerce Operator."}]}]}
```

## Legacy Fields To Avoid
- participant `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`
