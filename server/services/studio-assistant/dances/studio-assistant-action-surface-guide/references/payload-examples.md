# Payload Examples

## Create Performer With Inline Tal

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"coder","name":"Coder","talDraft":{"name":"Coder Tal","content":"You write code carefully."}}]}
```

## Create Performer With Inline Tal And Dance

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"researcher","name":"Researcher","talDraft":{"name":"Researcher Tal","content":"You research carefully."},"addDanceDrafts":[{"name":"Source Validation","content":"# Source Validation\n\nUse this skill to validate sources."}]}]}
```

## Create Connected Act

```json
{"version":1,"actions":[{"type":"createPerformer","ref":"dev","name":"Developer"},{"type":"createPerformer","ref":"rev","name":"Reviewer"},{"type":"createAct","name":"Code Review","participantPerformerRefs":["dev","rev"],"relations":[{"sourcePerformerRef":"dev","targetPerformerRef":"rev","direction":"one-way","name":"request review","description":"Developer sends work to Reviewer for review."}]}]}
```

## Update Relation

```json
{"version":1,"actions":[{"type":"updateRelation","actName":"Code Review","relationId":"rel-abc123","name":"request review","description":"Developer sends work to Reviewer for review.","direction":"one-way"}]}
```

## Set Act Rules And Subscriptions

```json
{"version":1,"actions":[{"type":"updateAct","actName":"Code Review","actRules":["Escalate blockers quickly.","Keep review comments actionable."]},{"type":"updateParticipantSubscriptions","actName":"Code Review","performerName":"Reviewer","subscriptions":{"messagesFromPerformerNames":["Developer"],"messageTags":["review-request"],"callboardKeys":["review-summary"],"eventTypes":["runtime.idle"]}}]}
```

## Create Dance Bundle

```json
{"version":1,"actions":[{"type":"createDanceDraft","ref":"skill","name":"Review Skill","content":"---\nname: review-skill\ndescription: Review workflow helpers.\n---\n\n# Review Skill\n\nUse this skill when you need a review workflow."},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"references/checklist.md","content":"# Checklist\n\n- Verify scope\n- Leave actionable feedback"},{"type":"upsertDanceBundleFile","draftRef":"skill","path":"agents/openai.yaml","content":"display_name: Review Skill\nshort_description: Review workflow helpers\ndefault_prompt: Use this skill when review structure matters."}]}
```

## UI Operation

```json
{"version":1,"actions":[{"type":"showPerformer","performerName":"Researcher","surface":"editor"},{"type":"setStudioPanel","panel":"assetLibrary","open":true}]}
```
