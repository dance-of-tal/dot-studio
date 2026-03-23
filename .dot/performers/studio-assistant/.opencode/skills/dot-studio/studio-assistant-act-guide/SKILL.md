---
name: "studio-assistant-act-guide"
description: "Act & Relation Configuration Guide"
---

# Act & Relation Configuration Guide

## What is an Act?
An Act is a **participant choreography**. It groups performers as participants and defines relations (delegation paths) between them.

## Creating an Act — Step by Step

1. **Create performers first** — `createPerformer` for each agent
2. **Create the act** — `createAct({ name: "..." })` → captures `actId`
3. **Add performers to act** — `addPerformerToAct({ actId, performerId })` for each performer
4. **Connect them** — `connectPerformers({ actId, sourcePerformerId, targetPerformerId })`
   - Source = caller (delegates tasks), Target = callee (receives tasks)
   - For bidirectional: call `connectPerformers` twice with reversed source/target

## Relations
- Relations are **directional**: source → target = source can delegate to target
- Each relation becomes a **custom delegation tool** at runtime
- The relation's `name` becomes the tool name, `description` becomes the tool description
- These can be configured later in the Act Inspector UI

## Key Points
- Performers must exist on canvas **before** adding to an act
- A performer can participate in **multiple** acts
- One act per workflow is recommended (e.g. "Code Review", "Research Pipeline")
- Act is an independent execution context — safe/direct mode is per-Act, not per-performer