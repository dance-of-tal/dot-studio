# Performer and Act — Action Reference

You can modify the Studio canvas by appending an `<assistant-actions>` block to the end of your reply.
The block must contain raw JSON shaped like `{"version":1,"actions":[...]}`.

## Protocol Rules
- Put all mutations for one user request in a single `actions` array, in execution order.
- Place the block at the very end of your reply, outside Markdown text.
- Use only supported action types and field names.
- Reuse existing performers, acts, and drafts from the Stage snapshot instead of recreating them.
- Use exact `id` values from the Stage snapshot when available.
- Use `ref` on create actions, then `performerRef` / `actRef` / `draftRef` in later actions in the same block.
- For models, use values from `availableModels` in the snapshot. Do not invent provider or model ids.
- Tal and Dance can only be created or modified as local drafts.

---

## Tal / Dance Drafts

### Create a Tal draft
```html
<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"my-tal","name":"Senior Engineer","content":"You are a senior software engineer...","openEditor":true}]}</assistant-actions>
```

### Update a Tal draft (by name or id)
```html
<assistant-actions>{"version":1,"actions":[{"type":"updateTalDraft","draftName":"Senior Engineer","content":"Updated instructions..."}]}</assistant-actions>
```

### Delete a Tal draft
```html
<assistant-actions>{"version":1,"actions":[{"type":"deleteTalDraft","draftName":"Senior Engineer"}]}</assistant-actions>
```

Same pattern for `createDanceDraft`, `updateDanceDraft`, `deleteDanceDraft`.

---

## Performer

### Create a performer (name only)
```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"reviewer","name":"Code Reviewer"}]}</assistant-actions>
```

### Create a performer with model + inline Tal draft
```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"coder","name":"Coder","model":{"provider":"anthropic","modelId":"claude-sonnet-4"},"talDraft":{"name":"Coder Tal","content":"You are an expert software engineer..."}}]}</assistant-actions>
```

### Create a performer and attach an existing Tal draft
```html
<assistant-actions>{"version":1,"actions":[{"type":"createTalDraft","ref":"tal1","name":"Analyst","content":"You analyze data carefully."},{"type":"createPerformer","name":"Data Analyst","talDraftRef":"tal1"}]}</assistant-actions>
```

### Update a performer (rename, swap model, add/remove dances, add/remove MCP)
```html
<assistant-actions>{"version":1,"actions":[{"type":"updatePerformer","performerName":"Code Reviewer","name":"Senior Reviewer","model":{"provider":"anthropic","modelId":"claude-opus-4"},"addMcpServerNames":["github"],"removeMcpServerNames":["old-server"]}]}</assistant-actions>
```

### Delete a performer
```html
<assistant-actions>{"version":1,"actions":[{"type":"deletePerformer","performerName":"Old Performer"}]}</assistant-actions>
```

---

## Act

### Create an act (empty)
```html
<assistant-actions>{"version":1,"actions":[{"type":"createAct","ref":"review-flow","name":"Code Review Pipeline"}]}</assistant-actions>
```

### Create an act with inline participants + relation (one shot)
```html
<assistant-actions>{"version":1,"actions":[{"type":"createPerformer","ref":"dev","name":"Developer"},{"type":"createPerformer","ref":"rev","name":"Reviewer"},{"type":"createAct","name":"Code Review Pipeline","participantPerformerRefs":["dev","rev"],"relations":[{"sourcePerformerRef":"dev","targetPerformerRef":"rev","direction":"one-way","description":"submit code for review"}]}]}</assistant-actions>
```

### Update an act (rename / description)
```html
<assistant-actions>{"version":1,"actions":[{"type":"updateAct","actName":"Code Review Pipeline","name":"Review Pipeline","description":"Daily code review workflow"}]}</assistant-actions>
```

### Delete an act
```html
<assistant-actions>{"version":1,"actions":[{"type":"deleteAct","actName":"Old Act"}]}</assistant-actions>
```

---

## Participants

### Attach an existing performer to an act
```html
<assistant-actions>{"version":1,"actions":[{"type":"attachPerformerToAct","actName":"Code Review Pipeline","performerName":"Developer"}]}</assistant-actions>
```

### Detach a participant from an act
```html
<assistant-actions>{"version":1,"actions":[{"type":"detachParticipantFromAct","actName":"Code Review Pipeline","performerName":"Developer"}]}</assistant-actions>
```

---

## Relations

### Connect two performers
```html
<assistant-actions>{"version":1,"actions":[{"type":"connectPerformers","actName":"Code Review Pipeline","sourcePerformerName":"Developer","targetPerformerName":"Reviewer","direction":"one-way","description":"submit code for review"}]}</assistant-actions>
```

### Update a relation (needs relationId from snapshot)
```html
<assistant-actions>{"version":1,"actions":[{"type":"updateRelation","actName":"Code Review Pipeline","relationId":"rel-abc123","description":"submit PR for review","direction":"one-way"}]}</assistant-actions>
```

### Remove a relation
```html
<assistant-actions>{"version":1,"actions":[{"type":"removeRelation","actName":"Code Review Pipeline","relationId":"rel-abc123"}]}</assistant-actions>
```
