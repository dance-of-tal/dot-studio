# Assistant Action Surface

Use this skill when you need the exact current mutation surface.

## Output Shape
- For stage mutations, always end with exactly one raw `<assistant-actions>...</assistant-actions>` block.
- Do not emit bare JSON or fenced JSON for stage mutations.
- Validate the whole block before sending it. One invalid action can cause the entire block to be ignored.

## Supported Action Families
- Install/import: `installRegistryAsset`, `addDanceFromGitHub`, `importInstalledPerformer`, `importInstalledAct`
- Tal draft: `createTalDraft`, `updateTalDraft`, `deleteTalDraft`
- Dance draft: `createDanceDraft`, `updateDanceDraft`, `deleteDanceDraft`
- Performer: `createPerformer`, `updatePerformer`, `deletePerformer`
- Act: `createAct`, `updateAct`, `deleteAct`
- Participant: `attachPerformerToAct`, `detachParticipantFromAct`
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
- A new Performer should reflect the user's requested role and working style, not a generic placeholder.
- If the user request implies a concrete Tal, Dance, or model choice, include it in the Performer setup.
- If the user explicitly asks to omit Tal, Dance, or model setup, honor that omission.
- If more than one reasonable Tal/Dance/model setup is possible, ask a short clarifying question before creating the Performer.

## Act Fields
`createAct` supports:
- `name`
- `description`
- `actRules`
- `participantPerformerIds`
- `participantPerformerRefs`
- `participantPerformerNames`
- inline `relations`

For inline relations and `connectPerformers`, prefer:
- explicit source and target performers
- `direction`
- `name`
- `description`

Rules:
- `actRules` must be an array of strings.
- The Act should reflect the user request in its participant set, role split, workflow shape, and actRules when requested.
- If the Act needs missing participants, create those Performers first in cascade and make sure they also match the user intent.
- For team or workflow requests, a new Act with multiple participants but no relations is usually wrong.
- If the user asks for something like a `d2c company`, include at least one relation in the same `createAct`.
- Use `source...` and `target...` relation fields, not `from...` or `to...`.
- Every new relation must include both a non-empty `name` and non-empty `description`.

## Install And Import
- Use `installRegistryAsset` when the user already knows a registry URN.
- Use `addDanceFromGitHub` for GitHub or skills.sh dance installs.
- Use `importInstalledPerformer` or `importInstalledAct` after install when the goal is to place that asset on the canvas.

## Compact Examples

Create a performer with inline Tal draft:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"coder","name":"Coder","model":{"provider":"anthropic","modelId":"claude-sonnet-4"},"talDraft":{"name":"Coder Tal","content":"You write code carefully."}}]}</assistant-actions>
```

Create an Act with participants and one publishable relation:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"dev","name":"Developer"},{"type":"createPerformer","ref":"rev","name":"Reviewer"},{"type":"createAct","name":"Code Review","participantPerformerRefs":["dev","rev"],"relations":[{"sourcePerformerRef":"dev","targetPerformerRef":"rev","direction":"one-way","name":"request review","description":"Developer sends work to Reviewer for review."}]}]}</assistant-actions>
```

Update a relation by `relationId`:

```html
<assistant-actions>{"version":1,"actions":[{"type":"updateRelation","actName":"Code Review","relationId":"rel-abc123","name":"request review","description":"Developer sends work to Reviewer for review.","direction":"one-way"}]}</assistant-actions>
```

Create a D2C company Act with connected participants:

```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"brand","name":"Brand Strategist"},{"type":"createPerformer","ref":"growth","name":"Growth Marketer"},{"type":"createPerformer","ref":"ops","name":"Ecommerce Operator"},{"type":"createAct","name":"D2C Company","participantPerformerRefs":["brand","growth","ops"],"relations":[{"sourcePerformerRef":"brand","targetPerformerRef":"growth","direction":"one-way","name":"campaign brief","description":"Brand Strategist hands positioning and campaign priorities to Growth Marketer."},{"sourcePerformerRef":"growth","targetPerformerRef":"ops","direction":"one-way","name":"launch handoff","description":"Growth Marketer hands launch requirements and expected volume to Ecommerce Operator."}]}]}</assistant-actions>
```

## Asset Dialog
- For Performer or Act creation requests, it is valid to use a short question-and-answer flow before mutating when important design choices are missing.
- Ask only the smallest high-value questions needed to determine the correct asset shape.
