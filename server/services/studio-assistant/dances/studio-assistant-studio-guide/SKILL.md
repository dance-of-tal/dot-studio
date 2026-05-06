---
name: studio-assistant-studio-guide
description: "Explains DOT Studio navigation, UI vocabulary, Asset Library behavior, Stage vs thread terminology, and visible control names. Use for product-help questions. For direct UI mutation payloads, load studio-assistant-ui-operations-guide."
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# DOT Studio UI Guide

Use this skill for navigation, feature-discovery, and product-usage questions.

## Answer Rules
- Use exact visible UI labels when known.
- Start with the shortest correct answer.
- Prefer short navigation paths over broad descriptions.
- Distinguish `Stage`, `working directory`, `draft`, `installed asset`, `session`, and `thread`.
- Do not describe actions that are not visible in the current UI.
- If the user asks Studio to perform the UI action, load `studio-assistant-ui-operations-guide`.

## Core Vocabulary
- `Tal`: always-on instruction/persona layer for a Performer.
- `Dance`: optional reusable skill bundle.
- `Performer`: an agent on the canvas built from Tal, Dance, model, and MCP.
- `Act`: a workflow that connects performers as participants.
- `Workspace`: current project folder plus saved Studio state.
- `Working directory`: the actual filesystem folder.
- `Stage`: the product surface containing current workspace objects; do not use it as a synonym for working directory.
- `Draft`: local authoring state for Tal or Dance.
- `Installed asset`: locally available Tal, Dance, Performer, or Act.
- `Session`: one performer chat history.
- `Act thread`: one runtime execution/history of an Act.

## Main Layout
- Top toolbar: workspace controls, terminal menu, tracking, save/publish selected asset, theme, settings, assistant.
- Left sidebar: Workspace Explorer plus Asset Library drawer.
- Center canvas: performers, Acts, markdown editors, terminals.
- Right panel: Studio Assistant or Workspace Tracking.

## Common Navigation
- Assistant: toolbar `Assistant`.
- Settings: toolbar `Settings`.
- Asset Library: bottom of the left sidebar, `Asset Library`.
- Installed assets: `Asset Library -> Local -> Installed Assets`.
- Models and MCPs: `Asset Library -> Local -> Runtime`.
- Registry search: `Asset Library -> Registry`.
- GitHub Dance import: `Asset Library -> Registry -> Import as Dance`.
- Dance export: open a Dance draft editor, save it, then use `Export`.

## Asset Library Notes
- Local scope has `Installed Assets` and `Runtime`.
- Installed asset kind tabs include `Performer`, `Tal`, `Dance`, and `Act`.
- Source filters include `All`, `Global`, `Workspace`, and `Draft`.
- Runtime `Models` lists available model providers.
- Runtime `MCPs` manages Studio MCP server definitions.
- A Performer uses an MCP only after the MCP card is attached to that Performer.
- Registry search is discovery/install, not direct canvas mutation by itself.

## Act Window Notes
- An Act window is for running an Act thread, not primarily for editing topology.
- If no thread exists and the Act is runnable, the empty state shows `Ready to run` and `Create Thread`.
- After a thread exists, use `Board` for shared notes and participant tabs for participant chat.
- Use `Edit Act` to change participants, relations, description, rules, or readiness issues.

## Draft And Publish Notes
- Tal and Dance use markdown editor shells.
- Tal editor actions include `Save Draft` and `Close`.
- Dance editor actions include `Save Draft`, `Open`, `Export`, and `Close`.
- Dance uses export/import rather than the generic registry publish flow.
- `Save Local` and `Publish` are asset lifecycle actions outside Assistant CRUD.

## More Detail
Read `references/navigation.md` only when exact UI behavior or labels matter.
