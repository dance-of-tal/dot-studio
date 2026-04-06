# Runtime Change Boundary Guide

## Purpose

This document defines the canonical runtime change policy for DOT Studio.

Use this guide when changing:

- performer runtime config
- Tal or Dance draft content used by performers
- Act definitions and participant bindings
- OpenCode global or project config
- provider auth
- MCP catalog or MCP auth

OpenCode does not reliably pick up agent, MCP, or config changes until `dispose` runs.
Do not bypass this policy.

## Canonical Policy

Studio classifies changes into exactly three classes:

1. `hot`
   - UI-only state
   - no projection write requirement
   - no runtime reload requirement
   - no chat blocking
2. `lazy_projection`
   - stage content that affects projected agents or tools
   - edit immediately
   - do not affect the currently running session
   - re-project on the next execution path
   - dispose only if projection output actually changed
3. `runtime_reload`
   - OpenCode-managed runtime config or auth changes
   - mark `runtimeReloadPending` immediately
   - if a session is busy, keep the change queued and block new execution until idle

Client-side source of truth:

- `src/store/runtime-change-policy.ts`
- `src/store/runtime-execution.ts`

Server-side execution preparation:

- `server/services/runtime-preparation-service.ts`

Provider and model catalog rule:

- provider and model availability in Studio should follow OpenCode's `provider.list()` for the active working directory
- do not maintain separate Studio-only fallback provider catalogs or auth-derived connected state overlays

## Entity Matrix

`hot`

- canvas position and size
- focus and selection state
- sidebar and modal visibility
- terminal window position and size
- performer visibility toggles
- Act board layout moves
- authoring-only UI state that does not change runtime projection

`lazy_projection`

- performer create, update, delete
- performer Tal, Dance, model, variant, agent mode, MCP, binding, delivery mode changes
- Tal and Dance draft content changes
- Act create, update, delete
- Act participants, relations, rules, safety, and imported Act payload changes
- asset uninstall or draft delete when it cascades into performer or Act runtime state

`runtime_reload`

- OpenCode global config writes
- OpenCode project config writes
- provider auth save, OAuth completion, or auth clear
- MCP catalog save
- MCP auth completion or auth clear

## Canonical State

Do not use broad serialized workspace signatures to infer runtime changes.

Use these flags instead:

- `runtimeReloadPending`
- `projectionDirty.performerIds`
- `projectionDirty.actIds`
- `projectionDirty.draftIds`
- `projectionDirty.workspaceWide`

Meaning:

- `runtimeReloadPending` is only for OpenCode runtime reload work
- `projectionDirty` is only for lazy projection work
- these two flags must not be merged into one concept

## Execution Flow

All new execution paths must follow this order:

1. apply pending runtime reload first
2. if reload is still blocked by a busy session, stop
3. check whether the target is affected by `projectionDirty`
4. if affected, persist workspace state before execution
5. compile projection
6. if projection output did not change, continue without dispose
7. if projection output changed and any session in the same working directory is busy, stop
8. if projection output changed and no session is busy, run `dispose`
9. start execution with the new runtime snapshot

Current run rule:

- a busy session keeps the runtime snapshot it started with
- edits made during that run do not affect that run
- the next run gets the new snapshot

Preview rule:

- projection preview may materialize projection files
- projection preview must not clear `projectionDirty`
- projection preview or prewarm may leave the working directory in a `projection pending adoption` state
- `projection pending adoption` means files are already written, but the current OpenCode runtime has not been refreshed to use them yet
- only a successful execution-boundary `dispose` clears that pending adoption state
- only actual execution clears consumed projection dirtiness

Act rule:

- Act thread creation and Act definition sync may prewarm participant agent projections without creating participant chat sessions
- this prewarm step must not call `dispose`
- the first later execution in that working directory adopts the prewarmed projection by running the normal execution-boundary dispose once
- if an Act wake hits `projection_update_pending` because another working-dir session is still busy, the wake should be deferred and retried after the runtime becomes idle instead of being dropped

## Do Not Reintroduce

Do not reintroduce:

- `initRuntimeReloadMonitor(...)`
- `buildRuntimeReloadSignature(...)` as the primary runtime policy
- mutation-path-specific ad hoc dispose calls
- send-path-specific projection policy forks
- save-time or mutation-time automatic dispose for lazy projection changes
- logic that lets a busy session adopt a new runtime snapshot mid-run

If a new patch changes runtime behavior, route it through:

- `recordStudioChange(...)` on the client
- `preparePendingRuntimeExecution(...)` on the client
- `prepareRuntimeForExecution(...)` on the server
