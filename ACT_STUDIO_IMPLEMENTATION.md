# Studio Act Implementation Plan

## Purpose

This document describes how Studio should be updated so that Act authoring works coherently from:

- edit mode
- participant and relation authoring
- draft and asset boundaries
- thread creation
- participant chat
- callboard and activity inspection
- runtime continuity expectations

It is intentionally implementation-oriented.
It complements `ACT_CONTRACT_GUIDE.md`.

## Scope

This plan covers the Studio package only.

It focuses on:

- contract correctness
- Studio workspace state correctness
- UI and UX continuity from editing to runtime use
- runtime readiness and thread lifecycle behavior

It does not redefine the canonical Act asset contract.
That remains owned by `dance-of-tal/contracts`.

## Current Authoritative Paths

### Canonical contract

- `../dot/src/contracts/act.ts`
- `studio/shared/dot-types.ts`
- `studio/shared/act-types.ts`

### Studio editor and workspace state

- `studio/src/store/actSlice.ts`
- `studio/src/store/act-slice-helpers.ts`
- `studio/src/store/workspace-draft-actions.ts`
- `studio/src/store/types.ts`
- `studio/src/features/act/ActFrame.tsx`
- `studio/src/features/act/ActInspectorPanel.tsx`
- `studio/src/features/act/ActMetaView.tsx`
- `studio/src/features/act/ActParticipantBindingView.tsx`
- `studio/src/features/act/ActRelationView.tsx`
- `studio/src/components/panels/WorkspaceExplorerThreadsSection.tsx`
- `studio/src/components/panels/WorkspaceExplorerActGroup.tsx`

### Runtime and thread services

- `studio/src/features/act/ActChatPanel.tsx`
- `studio/src/features/act/ActActivityView.tsx`
- `studio/src/store/chat/chat-send-actions.ts`
- `studio/server/routes/act-runtime-threads.ts`
- `studio/server/services/act-runtime/act-runtime-service.ts`
- `studio/server/services/act-runtime/thread-manager.ts`

## Current Model Layers

Studio currently has four Act layers.

### 1. Canonical shared asset

This is the only shape allowed to cross package boundaries.

- participant array
- canonical performer URNs
- relation array without runtime ids
- validated by `parseActAsset`

### 2. Workspace Act

This is the editor and canvas shape.

- participant record keyed by participant key
- `performerRef` instead of canonical `performer` URN
- relation ids for stable UI editing
- canvas position and sizing
- authoring metadata

### 3. Runtime Act definition

This is what Studio sends when a thread is created.

- `ActDefinition`
- participant record with `performerRef`
- relations with runtime ids still present
- optional runtime-only safety field exists in type space

### 4. Thread runtime state

This is the active execution state.

- mailbox
- callboard
- wake conditions
- participant sessions
- event log
- thread status

## What Already Works

### Import boundary

Installed and registry Act assets are parsed with `parseActAsset` before they are converted into workspace state.

This is the correct boundary behavior.

### Studio-only draft boundary

Act drafts remain Studio-local and are allowed to preserve Studio fields such as:

- `performerRef`
- relation `id`
- workspace-only metadata

This is acceptable because drafts are not canonical assets.

### Thread creation snapshot

Thread creation already snapshots the current workspace Act and sends it to the server.

This is the correct high-level shape for runtime startup.

### Left sidebar thread navigation

The workspace sidebar already supports:

- per-Act thread groups
- thread creation
- thread selection
- thread counts and status badges

## Confirmed Gaps

The following gaps exist today and should be addressed.

### 1. No readiness gate before thread creation

Current behavior:

- `createThread` can be triggered directly from the left sidebar
- the client does not block thread creation for invalid or incomplete Acts
- the server does not validate the runtime snapshot before storing the thread

Impact:

- users can create threads for Acts that are not runnable
- invalid state is detected too late, usually when they try to send the first participant message

Examples of missing readiness checks:

- zero participants
- multiple participants but no relations
- performer ref cannot resolve to runnable performer runtime config
- no model configured for a selected participant

### 2. Edit-to-run flow has a UX break

Current behavior:

- editing happens in the Act inspector
- runtime usage happens in `ActChatPanel`
- thread creation is exposed in the left sidebar, not in the Act surface itself
- the empty state says to select or create a thread from the left sidebar

Impact:

- the main Act surface does not provide a complete author-then-run loop
- the user must know that thread creation lives in a different region of the UI

### 3. Imported registry performer refs are not guaranteed to be runnable

Current behavior:

- imported Act assets convert canonical participant `performer` URNs into Studio `performerRef`
- `sendActMessage` tries to resolve runtime config from a local Studio performer node
- when a registry-bound participant has no corresponding local performer node, runtime config is unresolved
- chat then behaves like the model is not configured

Impact:

- an imported canonical Act may be structurally valid but still not runnable in Studio
- this is a major UX gap between import correctness and runtime usability

This is the highest-risk gap in the current flow.

### 4. Validation is advisory, not actionable

Current behavior:

- `ActMetaView` surfaces warnings such as disconnected participants
- these warnings are not used as hard readiness checks
- they are not reflected in thread creation affordances or status

Impact:

- the product exposes warnings but not a clear ready / blocked state
- users must infer which warnings are cosmetic versus execution-blocking

### 5. Runtime thread state is ephemeral

Current behavior:

- thread runtime is held in memory by the server-side `ThreadManager`
- threads are keyed by working directory and server process lifetime
- restart resets thread runtime state

Impact:

- users can perceive thread state as durable when it is not
- the current UX does not clearly communicate the lifecycle boundary

### 6. Activity view is polling, not real-time

Current behavior:

- `ActActivityView` polls every 5 seconds
- comments describe it as real-time

Impact:

- the product language over-promises the actual runtime behavior
- event freshness is inconsistent during active collaboration

### 7. Runtime-only safety config is defined but not productized

Current behavior:

- `ActDefinition` includes optional `safety`
- there is no complete UI flow to edit, persist, and apply it consistently
- thread creation does not visibly surface safety settings

Impact:

- the type system suggests a supported feature that the UX does not actually provide

### 8. Some Act editor copy is not aligned

Current behavior:

- at least one placeholder in `ActRelationView` is still Korean
- the Act surface does not always explain what the next required action is in the most local context

Impact:

- inconsistent UX quality
- violates the repository preference that front-facing content stay in English

## Target UX

The target user flow should be:

1. Create or open an Act.
2. Edit Act metadata, participants, and relations in one obvious place.
3. See a persistent readiness summary for the Act.
4. Create a thread from either the Act surface or the sidebar.
5. Land inside the newly created thread automatically.
6. See why the Act is blocked if it is not runnable.
7. Send the first participant message without needing hidden prerequisites.
8. View callboard and event activity in a way that matches actual runtime freshness.

## Target Product Rules

### Readiness rule

An Act is runnable only when all of the following are true:

- it has at least one participant
- every participant binding resolves to a runnable performer configuration
- if there are multiple participants, at least one relation exists
- every relation references known participant keys
- the active participant selected for sending has a model configuration

### Thread creation rule

Thread creation must be blocked when readiness fails.

The user should receive:

- a compact readiness summary
- a primary blocking reason
- a one-click path to the relevant editor surface

### Runtime resolution rule

A participant bound by registry URN must be runnable without hidden assumptions.

Studio must choose one of these strategies explicitly:

- materialize a local performer runtime config for registry refs before thread usage
- or require attachment/import of a local performer node and clearly block thread creation until that is done

The first option is better UX.

### Draft rule

Studio drafts may remain Studio-shaped.

But the draft-to-local-save and draft-to-publish flows must always rebuild canonical assets from current workspace state and validate them again.

## Recommended Implementation Workstreams

## Workstream 1 — Add a first-class Act readiness model

### Goal

Introduce a single readiness evaluator used by:

- Act inspector
- Act frame header
- left sidebar thread group
- thread creation CTA
- chat empty state

### Implementation

Create a shared readiness helper, for example:

- `studio/src/features/act/act-readiness.ts`

It should produce a structured result such as:

```ts
{
  runnable: boolean
  issues: Array<{
    code: string
    severity: 'error' | 'warning'
    message: string
    focus?: { mode: 'act' | 'participant' | 'relation'; participantKey?: string; relationId?: string }
  }>
}
```

### Required checks

- no participants
- multiple participants with no relations
- disconnected or unknown relation endpoints
- unresolved registry performer runtime binding
- selected participant cannot run due to missing model

### Acceptance criteria

- the same Act produces the same readiness result across all surfaces
- thread creation uses this result as a hard gate

## Workstream 2 — Close the edit-to-thread UX gap

### Goal

Allow the user to move from editing to running without leaving the Act surface.

### Implementation

Update:

- `studio/src/features/act/ActFrame.tsx`
- `studio/src/features/act/ActHeaderActions.tsx`
- `studio/src/features/act/ActChatPanel.tsx`

Add:

- a `Create Thread` CTA directly in the Act surface when no thread exists
- a readiness badge or summary in the Act frame header
- local CTA buttons that jump to the relevant editor focus when blocked

### Acceptance criteria

- a user can edit an Act and launch its first thread without discovering a separate sidebar-only affordance
- when blocked, the Act surface explains the next step locally

## Workstream 3 — Make registry-bound participants runnable

### Goal

Remove the hidden dependency on pre-existing local performer nodes.

### Recommended direction

When a participant binding uses a registry URN, Studio should resolve a runtime performer configuration directly from installed asset data or materialize a local runtime performer projection.

### Candidate implementation points

- `studio/src/store/chat/chat-send-actions.ts`
- performer resolution helpers
- asset lookup helpers that already parse installed assets canonically

### Acceptance criteria

- importing a valid Act asset with performer URNs leads to a runnable path in Studio
- the user is no longer blocked simply because no local performer canvas node exists yet

## Workstream 4 — Validate thread creation on both client and server

### Goal

Do not create unusable threads.

### Client changes

- use readiness evaluation before `createThread`
- disable thread creation CTA when blocked
- surface blocking reasons inline

### Server changes

Update:

- `studio/server/routes/act-runtime-threads.ts`
- `studio/server/services/act-runtime/act-runtime-service.ts`

Add runtime snapshot validation so invalid `ActDefinition` payloads are rejected early.

### Acceptance criteria

- invalid runtime snapshots return a clear error response
- client and server validation messages are aligned

## Workstream 5 — Clarify thread lifecycle and persistence

### Goal

Align UX expectations with actual runtime behavior.

### Implementation

If thread runtime remains in-memory only, document and surface it in the UI:

- thread runtime resets on server restart
- event history is runtime-scoped unless explicitly persisted

If longer-lived runtime is desired, add explicit persistence as a separate milestone.

### Acceptance criteria

- the user is never misled into assuming durable runtime state

## Workstream 6 — Upgrade activity and callboard visibility

### Goal

Make runtime inspection feel continuous and trustworthy.

### Implementation

Short term:

- rename or reword any copy that implies strict real-time behavior
- improve refresh affordances

Medium term:

- move from polling to push or event-stream updates where available

### Acceptance criteria

- product language matches actual transport behavior
- event freshness is clearly communicated

## Workstream 7 — Productize or remove safety config

### Goal

Avoid dead surface area in the type system.

### Options

- fully implement editable runtime safety controls
- or remove `safety` from near-term Studio UX until supported

### Recommendation

Do not expose partial safety UX until thread startup can actually honor it and users can inspect its applied value.

## Workstream 8 — Copy and UX consistency cleanup

### Goal

Ensure Act UX is coherent and English-only.

### Immediate fixes

- replace remaining Korean placeholder text in `ActRelationView`
- make all empty states action-oriented and local to the user’s current surface
- standardize `Act`, `Thread`, `Callboard`, and `Participant` wording

## Proposed Milestones

### Milestone 1 — Contract and readiness baseline

- rewrite guide docs
- add `act-readiness` helper
- show readiness in inspector and sidebar
- block invalid thread creation

### Milestone 2 — Edit-to-run UX

- add in-frame create thread CTA
- add local remediation buttons for blocked Acts
- make thread launch and selection obvious from the Act surface

### Milestone 3 — Runtime performer resolution

- make registry-bound participants runnable
- align imported Act behavior with runtime expectations

### Milestone 4 — Runtime lifecycle and activity

- clarify persistence expectations
- improve activity freshness and callboard behavior
- decide whether to ship or defer safety config UX

## Acceptance Criteria

Studio should satisfy all of the following after implementation:

- a canonical Act asset can be imported without schema drift
- a workspace Act can be edited without losing runtime-only editor state
- a user can tell whether an Act is runnable before creating a thread
- thread creation is blocked for invalid or non-runnable Acts
- imported registry performer refs can be made runnable in a predictable way
- the Act surface itself can launch and use a thread
- chat and callboard UX explain blocked states locally
- all user-facing copy in the Act flow is English
- runtime lifecycle expectations are explicit

## Recommended First Fix Order

1. Add readiness evaluation.
2. Block invalid thread creation.
3. Add in-frame create-thread UX.
4. Fix registry performer runtime resolution.
5. Clean up copy and activity language.
6. Revisit safety config.

## Summary

The core architectural direction is already correct:

- canonical contract at package boundaries
- richer Studio workspace model for editing
- runtime thread snapshot for execution

The main remaining problems are product gaps between these layers.

The highest-priority work is to make readiness explicit and to close the gap between:

- an Act being structurally valid
- an Act being editable
- an Act being runnable
- an Act being easy to run from the surface where it is edited
