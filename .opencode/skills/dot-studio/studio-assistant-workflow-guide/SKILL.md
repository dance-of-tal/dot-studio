---
name: "studio-assistant-workflow-guide"
description: "DOT Studio Workflow Guide"
---

# DOT Studio Workflow Guide

## Common Patterns

### Single Expert
Create one performer and optionally configure it:
```
createPerformer({ name: "Code Reviewer" })
setPerformerModel({ performerId, providerId: "anthropic", modelId: "claude-sonnet-4-20250514" })
```

### Team Collaboration (Act)
```
// 1. Create performers
createPerformer({ name: "Researcher" }) → performer-1
createPerformer({ name: "Writer" }) → performer-2

// 2. Create act
createAct({ name: "Research Pipeline" }) → actId

// 3. Add to act
addPerformerToAct({ actId, performerId: "performer-1" })
addPerformerToAct({ actId, performerId: "performer-2" })

// 4. Connect: Researcher delegates writing to Writer
connectPerformers({ actId, sourcePerformerId: "performer-1", targetPerformerId: "performer-2" })
```

### Bidirectional Review
```
// Developer ↔ Reviewer
connectPerformers({ actId, sourcePerformerId: "dev-id", targetPerformerId: "reviewer-id" })
connectPerformers({ actId, sourcePerformerId: "reviewer-id", targetPerformerId: "dev-id" })
```

## Tips
- Explain each step to the user as you create
- Summarize the final setup after completing
- Ask clarifying questions if the request is vague
- Only set model if the user specifies one; otherwise it uses the project default