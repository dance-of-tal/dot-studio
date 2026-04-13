---
name: studio-assistant-performer-guide
description: Lists the exact current Studio Assistant mutation surface for Tal, Dance, Performer, Act, participant, relation, and install/import actions. Use when the assistant must produce, inspect, or verify `apply_studio_actions` tool payloads or reason about allowed fields.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Assistant Action Surface

Use this skill when you need the exact current mutation surface.

## Output Shape
- For stage mutations, call `apply_studio_actions`.
- Do not paste raw JSON or fenced JSON for stage mutations into the reply text.
- Validate the whole tool payload before calling it. One invalid action can cause the entire mutation call to be ignored.
- Omit unspecified optional fields instead of sending empty strings, null placeholders, or empty draft objects.

## Action Ordering
- Actions are applied sequentially in array order.
- Use same-call `ref` values for cascade flows where a later action depends on something created earlier in the same tool call.
- Prefer one dependency-ordered tool call over multiple loosely related calls.
- If the user asks for performers plus an Act in one request, do not split that into separate mutation turns unless a real ambiguity remains.

## Decision Ladder
- If the user only wants explanation, do not call the mutation tool.
- If the user wants mutation but multiple important choices remain open, ask one short clarifying question first.
- If the request is specific enough, call the tool with one complete payload rather than leaving a half-configured Performer or Act behind.
- Reuse existing Stage items when they already match the request. Do not create duplicates just because creation is easier than inspection.

## Supported Action Families
- CRUD coverage is fixed to all four authoring asset families:
- `Tal` = local draft CRUD
- `Dance` = local draft CRUD
- `Performer` = current Stage CRUD
- `Act` = current Stage CRUD
- Install/import: `installRegistryAsset`, `addDanceFromGitHub`, `importInstalledPerformer`, `importInstalledAct`
- Tal draft: `createTalDraft`, `updateTalDraft`, `deleteTalDraft`
- Dance draft: `createDanceDraft`, `updateDanceDraft`, `deleteDanceDraft`
- Dance bundle: `upsertDanceBundleFile`, `deleteDanceBundleEntry`
- Performer: `createPerformer`, `updatePerformer`, `deletePerformer`
- Act: `createAct`, `updateAct`, `deleteAct`
- Participant: `attachPerformerToAct`, `detachParticipantFromAct`, `updateParticipantSubscriptions`
- Relation: `connectPerformers`, `updateRelation`, `removeRelation`

## Performer Fields
`createPerformer` and `updatePerformer` support:
- `description`
- `model`
- `talUrn`
- `talDraftId`
- `talDraftRef`
- inline `talDraft`
- `addDanceUrns`
- `addDanceDraftIds`
- `addDanceDraftRefs`
- inline `addDanceDrafts`
- `removeDanceUrns`
- `removeDanceDraftIds`
- `addMcpServerNames`
- `removeMcpServerNames`

Rules:
- For explicit Performer create, update, or delete requests, use the matching Performer action directly.
- A new Performer should reflect the user's requested role and working style, not a generic placeholder.
- If the user explicitly names the requested performer roles, use those roles directly in `name` and mirror the requested job focus in `description`.
- If the user request implies a concrete Tal, Dance, or model choice, include it in the Performer setup.
- If the user explicitly asks to omit Tal, Dance, or model setup, honor that omission.
- If more than one reasonable Tal/Dance/model setup is possible, ask a short clarifying question before creating the Performer.
- If a new Performer needs a new Tal, prefer inline `talDraft` on `createPerformer`.
- If a new Performer needs new Dance drafts, prefer inline `addDanceDrafts` on `createPerformer`.
- If the drafts are created earlier in the same tool call, use `talDraftRef` and `addDanceDraftRefs`.
- Prefer one dependency-complete `createPerformer` over `createPerformer` followed by `updatePerformer` when the required Tal or Dance is already known.
- `addMcpServerNames` and `removeMcpServerNames` only reference existing Studio MCP library server names.
- Do not invent MCP server names and do not treat Performer actions as a way to create or edit Studio MCP library entries.

## Performer Quality Bar
- `name` should describe the actual role the user asked for, not a generic archetype unless the user asked for a generic archetype.
- `description` should capture how that performer thinks, what they own, or what kind of handoff they produce.
- When the user describes a company function or workflow seat, reflect that job in the Performer design instead of creating a thin placeholder.
- If a model is required, choose only from the current snapshot's `availableModels`.

## Act Fields
`createAct` supports:
- `name`
- `description`
- `actRules`
- `safety`
- `participantPerformerIds`
- `participantPerformerRefs`
- `participantPerformerNames`
- inline `relations`

`updateAct` supports:
- `name`
- `description`
- `actRules`
- `safety`

For inline relations and `connectPerformers`, prefer:
- explicit source and target performers
- `direction`
- `name`
- `description`

Rules:
- For explicit Act create, update, or delete requests, use the matching Act action directly.
- `actRules` must be a string array, not a single string.
- Performer `description` becomes participant focus in Act runtime.
- `safety` is Act-level runtime guardrails, not participant `wait_until`.
- The Act should reflect the user request in its participant set, role split, workflow shape, and actRules when requested.
- If the Act needs missing participants, create those Performers first in cascade and make sure they also match the user intent.
- When the Act participants are already known at creation time, prefer `participantPerformerRefs`, `participantPerformerIds`, or `participantPerformerNames` on `createAct`.
- For a brand-new workflow Act, prefer one create cascade over `createPerformer` followed by separate `attachPerformerToAct` actions.
- For team or workflow requests, a new Act with multiple participants but no relations is usually wrong.
- For team or workflow requests such as `d2c company`, `investment team`, or `review flow`, include at least one relation in the same `createAct`.
- Use `source...` and `target...` relation fields, not `from...` or `to...`.
- Every new relation must include both a non-empty `name` and non-empty `description`.
- Never invent ids such as `performer-1` or `act-1`. Use ids from the snapshot or same-call refs.

## Dance Bundle Files
`upsertDanceBundleFile` supports:
- `draftId`
- `draftRef`
- `draftName`
- `path`
- `content`

`deleteDanceBundleEntry` supports:
- `draftId`
- `draftRef`
- `draftName`
- `path`

Rules:
- Bundle file actions only work on saved Dance drafts.
- Use them for sibling files such as `references/*.md`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.
- `path` must stay relative to the Dance bundle root.
- Never target `SKILL.md` or `draft.json` with bundle file actions.
- Keep `SKILL.md` concise and move heavy examples or schemas into `references/`.
- Do not create extra bundle docs like `README.md` unless the user explicitly asked for them.

## Participant Subscriptions
`updateParticipantSubscriptions` targets a participant by:
- `participantKey`
- or attached `performerId`
- or same-call `performerRef`
- or exact `performerName`

`subscriptions` supports:
- `messagesFromParticipantKeys`
- `messagesFromPerformerIds`
- `messagesFromPerformerRefs`
- `messagesFromPerformerNames`
- `messageTags`
- `callboardKeys`
- `eventTypes`

Rules:
- Use `null` subscriptions to clear all current subscriptions.
- `messagesFrom...` resolves to participant keys already attached to the target Act.
- `eventTypes` currently only supports `runtime.idle`.
- `callboardKeys` is the canonical field name.

## Install And Import
- Install/import helpers are support paths, not CRUD for Tal, Dance, Performer, or Act.
- Use `installRegistryAsset` when the user already knows a registry URN.
- Use `addDanceFromGitHub` for GitHub or skills.sh dance installs.
- Use `importInstalledPerformer` or `importInstalledAct` after install when the goal is to place that asset on the canvas.
- Do not present `Save Local` or `Publish` as supported assistant CRUD operations.

## Asset Dialog
- For Performer or Act creation requests, it is valid to use a short question-and-answer flow before mutating when important design choices are missing.
- Ask only the smallest high-value questions needed to determine the correct asset shape.
- Good questions include role focus, model preference, Dance need, participant split, and handoff shape.

## Compact Examples

Create a performer with inline Tal draft:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"coder","name":"Coder","model":{"provider":"anthropic","modelId":"claude-sonnet-4"},"talDraft":{"name":"Coder Tal","content":"You write code carefully."}}]}
```

Create a dependency-complete performer with inline Tal and Dance drafts:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"researcher","name":"Researcher","talDraft":{"name":"Researcher Tal","content":"You research carefully."},"addDanceDrafts":[{"name":"Source Validation","content":"# Source Validation\n\nUse this skill to validate sources."}]}]}
```

Create an Act with participants and one publishable relation:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"dev","name":"Developer"},{"type":"createPerformer","ref":"rev","name":"Reviewer"},{"type":"createAct","name":"Code Review","participantPerformerRefs":["dev","rev"],"relations":[{"sourcePerformerRef":"dev","targetPerformerRef":"rev","direction":"one-way","name":"request review","description":"Developer sends work to Reviewer for review."}]}]}
```

Update a relation by `relationId`:

```json
{"version":1,"actions":[{"type":"updateRelation","actName":"Code Review","relationId":"rel-abc123","name":"request review","description":"Developer sends work to Reviewer for review.","direction":"one-way"}]}
```

Set Act rules and participant wake subscriptions:

```json
{"version":1,"actions":[{"type":"updateAct","actName":"Code Review","actRules":["Escalate blockers quickly.","Keep review comments actionable."]},{"type":"updateParticipantSubscriptions","actName":"Code Review","performerName":"Reviewer","subscriptions":{"messagesFromPerformerNames":["Developer"],"messageTags":["review-request"],"callboardKeys":["review-summary"],"eventTypes":["runtime.idle"]}}]}
```

Create a Dance draft and add bundle files:

```json
{"version":1,"actions":[{"type":"createDanceDraft","ref":"skill","name":"Review Skill","content":"---\nname: review-skill\ndescription: Review workflow helpers.\n---\n\n# Review Skill\n\nUse this skill when you need a review workflow."},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"references/checklist.md","content":"# Checklist\n\n- Verify scope\n- Leave actionable feedback"},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"agents/openai.yaml","content":"display_name: Review Skill\nshort_description: Review workflow helpers\ndefault_prompt: Use this skill when review structure matters."}]}
```

Cascade performers into an Act in one tool call:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"macro","name":"Macro Researcher"},{"type":"createPerformer","ref":"portfolio","name":"Portfolio Strategist"},{"type":"createAct","name":"Investment Advisory Team","actRules":["Always cite evidence.","Surface uncertainty and risk."],"participantPerformerRefs":["macro","portfolio"]}]}
```

Create a D2C company Act with connected participants:

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"brand","name":"Brand Strategist"},{"type":"createPerformer","ref":"growth","name":"Growth Marketer"},{"type":"createPerformer","ref":"ops","name":"Ecommerce Operator"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["brand","growth","ops"],"actRules":["Separate assumptions from evidence.","Flag channel risk early."],"relations":[{"sourcePerformerRef":"brand","targetPerformerRef":"growth","direction":"one-way","name":"campaign brief","description":"Brand Strategist hands positioning and campaign priorities to Growth Marketer."},{"sourcePerformerRef":"growth","targetPerformerRef":"ops","direction":"one-way","name":"launch handoff","description":"Growth Marketer hands launch requirements and expected volume to Ecommerce Operator."}]}]}
```
