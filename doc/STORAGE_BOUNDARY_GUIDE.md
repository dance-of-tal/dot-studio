# Studio Storage Boundary Guide

## Purpose

This document defines the minimum storage rules for DOT assets and Studio values.

Keep these boundaries separate:

1. `workspace` = Studio editor/canvas state
2. `draft` = project-local authoring save
3. `dot asset` = canonical install/save/publish unit
4. `runtime` = execution-only state

## 1. Studio Workspace Values

Studio workspace values are saved to:

- `~/.dot-studio/workspaces/<workspaceId>/workspace.json`

This file stores Studio-facing state such as:

- performers on the canvas
- acts on the canvas
- markdown editor windows
- chat bindings
- panel/window layout state

Rules:

- This is the source of truth for Studio UI/editor state.
- This is not a canonical DOT asset format.
- Workspace-only fields such as canvas position, window size, hidden state, relation ids, `performerRef`, and local editor metadata may live here.
- Do not treat `workspace.json` as publishable asset data.

## 2. Draft Values

Saved drafts are project-local and live under:

- `<workingDir>/.dance-of-tal/drafts/`

Examples:

- Tal / Performer / Act: `.dance-of-tal/drafts/<kind>/<id>.json`
- Dance: `.dance-of-tal/drafts/dance/<id>/draft.json` plus bundle files like `SKILL.md`, `scripts/`, `references/`, `assets/`

Rules:

- Drafts are the authoring-save boundary, not the canonical asset boundary.
- Unsaved markdown drafts are memory-only and are not written to disk.
- Only saved drafts participate in server-backed draft workflows.
- Drafts may contain Studio authoring metadata that must be normalized before local save or publish.

## 3. DOT Assets

Canonical local DOT assets are saved under:

- stage-local: `<workingDir>/.dance-of-tal/assets/...`
- global install scope: global dot directory assets

Rules:

- DOT assets are the canonical boundary for install, local save, and publish.
- DOT assets must use shared contract shapes and canonical URNs.
- Studio-only values must not leak into canonical asset files.
- If Studio wants to save or publish an asset, it must normalize workspace/draft data into canonical payload first.

Examples:

- Act canonical asset uses participant `performer` URNs, not Studio `performerRef`
- Canonical assets do not store canvas position, size, hidden state, runtime ids, or editor-only metadata

## 4. Runtime State

Runtime state lives under:

- `~/.dot-studio/workspaces/<workspaceId>/act-runtime/...`

Examples:

- `board.json`
- `events.jsonl`

Rules:

- Runtime state is execution-only.
- Runtime state is not a workspace snapshot and not a canonical DOT asset.
- Runtime files must never become the source of truth for published or installed assets.

## Core Boundary Rule

Use this flow only:

`Studio UI state -> saved draft or workspace snapshot -> canonical dot asset -> runtime projection/execution`

Do not collapse these layers.

In particular:

- do not write Studio-only fields into canonical asset files
- do not publish `workspace.json`
- do not treat runtime files as authoring data
- do not hand-edit `.opencode/` as the main source of truth

## Related Docs

- `doc/ACT_CONTRACT_GUIDE.md`
- `doc/publish_rule.md`
- `doc/RUNTIME_CHANGE_BOUNDARY_GUIDE.md`
