# Assistant Action Surface

Use this skill when you need the exact current mutation surface.

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

## Act Fields
`createAct` supports:
- `name`
- `description`
- `participantPerformerIds`
- `participantPerformerRefs`
- `participantPerformerNames`
- inline `relations`

For inline relations and `connectPerformers`, prefer:
- explicit source and target performers
- `direction`
- `name`
- `description`

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
