---
name: studio-assistant-performer-guide
description: Lists the current Studio Assistant mutation surface. Use when the assistant needs exact action-block fields for installs, drafts, performers, acts, participants, or relations.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Assistant Action Surface

Use this skill when you need the exact current mutation surface.

## Output Shape
- For stage mutations, always end with exactly one raw `<assistant-actions>...</assistant-actions>` block.
- Do not emit bare JSON or fenced JSON for stage mutations.
- Validate the whole block before sending it. One invalid action can cause the entire block to be ignored.

## Action Ordering
- Actions are applied sequentially in array order.
- Use same-block `ref` values for cascade flows where a later action depends on something created earlier in the same block.
- Prefer one dependency-ordered block over multiple loosely related blocks.

## Supported Action Families
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
- If a new Performer needs a new Tal, prefer inline `talDraft` on `createPerformer`.
- If a new Performer needs new Dance drafts, prefer inline `addDanceDrafts` on `createPerformer`.
- If the drafts are created earlier in the same block, use `talDraftRef` and `addDanceDraftRefs`.
- Prefer one dependency-complete `createPerformer` over `createPerformer` followed by `updatePerformer` when the required Tal or Dance is already known.
- `addMcpServerNames` and `removeMcpServerNames` only reference existing Studio MCP library server names.
- Do not invent MCP server names and do not treat Performer actions as a way to create or edit Studio MCP library entries.

## Act Fields
`createAct` supports:
- `name`
- `description`
- `actRules`
- `participantPerformerIds`
- `participantPerformerRefs`
- `participantPerformerNames`
- inline `relations`

`updateAct` supports:
- `name`
- `description`
- `actRules`

For inline relations and `connectPerformers`, prefer:
- explicit source and target performers
- `direction`
- `name`
- `description`

Rules:
- `actRules` must be a string array, not a single string.
- When the Act participants are already known at creation time, prefer `participantPerformerRefs`, `participantPerformerIds`, or `participantPerformerNames` on `createAct`.
- For team or workflow requests, a new Act with multiple participants but no relations is usually wrong.
- For team or workflow requests such as `d2c company`, `investment team`, or `review flow`, include at least one relation in the same `createAct`.
- Use `source...` and `target...` relation fields, not `from...` or `to...`.
- Every new relation must include both a non-empty `name` and non-empty `description`.
- Never invent ids such as `performer-1` or `act-1`. Use ids from the snapshot or same-block refs.

## Participant Subscriptions
`updateParticipantSubscriptions` targets a participant by:
- `participantKey`
- or attached `performerId`
- or same-block `performerRef`
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
- Use `installRegistryAsset` when the user already knows a registry URN.
- Use `addDanceFromGitHub` for GitHub or skills.sh dance installs.
- Use `importInstalledPerformer` or `importInstalledAct` after install when the goal is to place that asset on the canvas.

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

## Compact Examples

Create a performer with inline Tal draft:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"coder","name":"Coder","model":{"provider":"anthropic","modelId":"claude-sonnet-4"},"talDraft":{"name":"Coder Tal","content":"You write code carefully."}}]}</assistant-actions>
```

Create a dependency-complete performer with inline Tal and Dance drafts:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"researcher","name":"Researcher","talDraft":{"name":"Researcher Tal","content":"You research carefully."},"addDanceDrafts":[{"name":"Source Validation","content":"# Source Validation\n\nUse this skill to validate sources."}]}]}</assistant-actions>
```

Create an Act with participants and one publishable relation:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"dev","name":"Developer"},{"type":"createPerformer","ref":"rev","name":"Reviewer"},{"type":"createAct","name":"Code Review","participantPerformerRefs":["dev","rev"],"relations":[{"sourcePerformerRef":"dev","targetPerformerRef":"rev","direction":"one-way","name":"request review","description":"Developer sends work to Reviewer for review."}]}]}</assistant-actions>
```

Update a relation by `relationId`:

```html
<assistant-actions>{"version":1,"actions":[{"type":"updateRelation","actName":"Code Review","relationId":"rel-abc123","name":"request review","description":"Developer sends work to Reviewer for review.","direction":"one-way"}]}</assistant-actions>
```

Set Act rules and participant wake subscriptions:

```html
<assistant-actions>{"version":1,"actions":[{"type":"updateAct","actName":"Code Review","actRules":["Escalate blockers quickly.","Keep review comments actionable."]},{"type":"updateParticipantSubscriptions","actName":"Code Review","performerName":"Reviewer","subscriptions":{"messagesFromPerformerNames":["Developer"],"messageTags":["review-request"],"callboardKeys":["review-summary"],"eventTypes":["runtime.idle"]}}]}</assistant-actions>
```

Create a Dance draft and add bundle files:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createDanceDraft","ref":"skill","name":"Review Skill","content":"---\nname: review-skill\ndescription: Review workflow helpers.\n---\n\n# Review Skill\n\nUse this skill when you need a review workflow."},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"references/checklist.md","content":"# Checklist\n\n- Verify scope\n- Leave actionable feedback"},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"agents/openai.yaml","content":"display_name: Review Skill\nshort_description: Review workflow helpers\ndefault_prompt: Use this skill when review structure matters."}]}</assistant-actions>
```

Cascade performers into an Act in one block:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"macro","name":"Macro Researcher"},{"type":"createPerformer","ref":"portfolio","name":"Portfolio Strategist"},{"type":"createAct","name":"Investment Advisory Team","actRules":["Always cite evidence.","Surface uncertainty and risk."],"participantPerformerRefs":["macro","portfolio"]}]}</assistant-actions>
```

Create a D2C company Act with connected participants:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"brand","name":"Brand Strategist"},{"type":"createPerformer","ref":"growth","name":"Growth Marketer"},{"type":"createPerformer","ref":"ops","name":"Ecommerce Operator"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["brand","growth","ops"],"actRules":["Separate assumptions from evidence.","Flag channel risk early."],"relations":[{"sourcePerformerRef":"brand","targetPerformerRef":"growth","direction":"one-way","name":"campaign brief","description":"Brand Strategist hands positioning and campaign priorities to Growth Marketer."},{"sourcePerformerRef":"growth","targetPerformerRef":"ops","direction":"one-way","name":"launch handoff","description":"Growth Marketer hands launch requirements and expected volume to Ecommerce Operator."}]}]}</assistant-actions>
```
