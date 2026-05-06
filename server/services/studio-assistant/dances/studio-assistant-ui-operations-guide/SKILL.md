---
name: studio-assistant-ui-operations-guide
description: "Tells the Studio Assistant how to open, reveal, inspect, hide, show, move, resize, and panel-toggle Studio UI surfaces through apply_studio_actions. Use for direct Studio UI manipulation requests."
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Studio UI Operations Guide

Use this skill when the user asks Studio Assistant to manipulate the Studio interface.

## When To Use
- Open, show, reveal, select, focus, or inspect a Performer, Act, or draft.
- Open or close Asset Library, Workspace Tracking, or Terminal.
- Hide or show a Performer or Act.
- Move, resize, align, or arrange Performer/Act canvas windows.

## Action Choices
- `showPerformer`: select/reveal a Performer, or open its editor with `surface: "editor"`.
- `showAct`: select/reveal an Act, or open its editor with `surface: "editor"`.
- `showDraft`: open a Tal or Dance draft editor.
- `setStudioPanel`: toggle `assetLibrary`, `workspaceTracking`, or `terminal`.
- `setStudioNodeVisibility`: set visible/hidden state for a Performer or Act.
- `setStudioNodeFrame`: set absolute `position` and/or `size` for a Performer or Act.

## Targeting Rules
- Prefer exact ids from the snapshot.
- Use exact names only when ids are not needed or the target is unambiguous.
- Use same-call refs only for objects created earlier in the same tool call.
- Ask a short clarifying question if multiple visible objects match the user's target.

## Surface Rules
- For `showPerformer` and `showAct`, omit `surface` or use `surface: "canvas"` for simple show/reveal requests.
- Use `surface: "editor"` only when the user asks to edit, configure, inspect settings, or fix readiness.
- For `showAct` editor requests:
  - `editorMode: "act"` for general Act editing
  - `editorMode: "participant"` with `participantKey`
  - `editorMode: "relation"` with `relationId`

## Geometry Rules
- Use `setStudioNodeFrame` only when the snapshot provides current position and size or the user gives explicit coordinates/size.
- Use absolute canvas coordinates.
- Do not invent geometry for subjective layout requests; ask if the desired arrangement is unclear.
- UI-only changes are hot Studio state. Do not describe them as saved, published, installed, or runtime-affecting.

## Examples

```json
{"version":1,"actions":[{"type":"showPerformer","performerName":"Writer","surface":"editor"}]}
```

```json
{"version":1,"actions":[{"type":"setStudioPanel","panel":"assetLibrary","open":true}]}
```

```json
{"version":1,"actions":[{"type":"setStudioNodeFrame","nodeType":"act","actName":"Review Flow","position":{"x":320,"y":240},"size":{"width":520,"height":460}}]}
```
