# Studio Act Contract Guide

## Purpose

This document defines the current Act contract boundaries used by DOT Studio.

Studio must stay aligned with:

- `dance-of-tal/contracts`
- Registry publish validation
- Studio import/export boundaries
- Studio runtime thread behavior

Full rewrite policy applies.
Do not add compatibility fallbacks for legacy Act shapes.

For current implementation gaps and the recommended remediation plan, see `ACT_STUDIO_IMPLEMENTATION.md`.

## Source of Truth

The canonical shared asset contract lives in:

- `dot/src/contracts/act.ts`
- exported through `dance-of-tal/contracts`

Studio may add workspace-only and runtime-only fields, but it must not redefine the shared asset shape.

## Four Distinct Act Layers

Studio currently works with four related but different representations:

1. **Canonical Act asset**
   - Shared across package boundaries
   - Parsed by `parseActAsset`
   - Used for installed assets, registry assets, local save, and publish boundaries

2. **Studio workspace Act**
   - Canvas/editor representation stored in Studio workspace state
   - Uses participant records keyed by participant key
   - Adds relation ids, canvas position, size, visibility, and authoring metadata

3. **Studio runtime Act definition**
   - Initial definition sent to `/api/act/:actId/threads`
   - Uses participant records with `performerRef`
   - May enrich each participant with runtime-only `displayName` and `description`
   - May be replaced for active or idle threads through runtime-definition sync
   - Used only for runtime execution, never for canonical asset serialization

4. **Act thread runtime state**
   - Mailbox, shared board, wake conditions, per-participant sessions, and event log
   - Never serialized as a canonical asset

These layers must not be conflated.

## Canonical Act Asset Contract

### Participant subscriptions

```ts
type ActParticipantSubscriptionsV1 = {
  messagesFrom?: string[]
  messageTags?: string[]
  callboardKeys?: string[]
  eventTypes?: Array<'runtime.idle'>
}
```

Rules:

- every value must be a non-empty string
- `eventTypes` currently only supports `runtime.idle`
- `callboardKeys` remains the canonical contract field name even though Studio runtime UX describes the same runtime surface as the shared board or shared notes

### Participant

```ts
type ActParticipantV1 = {
  key: string
  performer: string
  subscriptions?: ActParticipantSubscriptionsV1
}
```

Rules:

- use `key`, never `id`
- `performer` must be a canonical 4-segment performer URN
- `performer` is validated with `parseDotAssetUrn(..., 'performer')`

### Relation

```ts
type ActRelationV1 = {
  between: [string, string]
  direction: 'both' | 'one-way'
  name: string
  description: string
}
```

Rules:

- `between` must be a 2-item non-empty string tuple
- `direction` must be `both` or `one-way`
- `name` is required
- `description` is required
- relation order matters for `one-way`
- opposite one-way relations are valid and must be allowed as separate relations

### Asset payload

```ts
type ActAssetPayloadV1 = {
  actRules?: string[]
  participants: ActParticipantV1[]
  relations: ActRelationV1[]
}
```

Canonical parser invariants:

- `participants` must be an array
- `relations` must be an array
- there must be at least one participant
- participant keys must be unique
- every relation endpoint must reference an existing participant key
- if there are multiple participants, there must be at least one relation

## Forbidden Legacy Fields

These fields are intentionally unsupported in canonical Act assets:

- participant `id`
- participant `activeDances`
- relation `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`

Studio may keep runtime-only data separately, but it must never write these legacy fields into canonical assets.

## Studio Workspace Model

The Studio workspace model is intentionally richer than the canonical asset shape.

Workspace-specific Act state includes:

- `participants: Record<string, WorkspaceActParticipantBinding>`
- `relations: ActRelation[]` where `ActRelation = ActRelationV1 & { id: string }`
- canvas `position`, `width`, `height`
- `hidden`
- authoring metadata such as `meta.authoring`

Participant bindings are Studio-specific:

```ts
type ActParticipantBinding = {
  performerRef: SharedAssetRef
  displayName?: string
  subscriptions?: ActParticipantSubscriptionsV1
}
```

Key rule:

- `performerRef` is a Studio runtime/editor concept
- canonical assets use `performer: string` URNs instead

## Studio Runtime Model

Thread creation uses a runtime snapshot, not a canonical asset:

```ts
type ActDefinition = {
  id: string
  name: string
  description?: string
  actRules?: string[]
  participants: Record<string, ActParticipantBinding & {
    description?: string
  }>
  relations: ActRelation[]
  safety?: ActSafetyConfig
}
```

Runtime prompt/context rules:

- participant `description` in `ActDefinition` is runtime-only enrichment
- Studio derives it from the linked performer's `meta.authoring.description` when available
- runtime prompt context is relation-scoped: each participant sees its own role/focus plus directly connected participants
- canonical subscription field names remain unchanged at runtime boundaries, including `callboardKeys`
- participant prompt context may reinterpret directly connected participants' `messageTags` and `callboardKeys` as coordination signals
- `eventTypes` remains a system-level wake trigger and should not be surfaced as a normal participant-facing coordination hint
- stable collaboration rules belong in system or agent context, not in per-wake event text
- wake delivery text should separate the wake cause from the delivered collaboration content
- runtime-internal mailbox or queue terms such as `pending` are implementation details and should not be exposed to participants unless product UX explicitly requires them
- this description must not be written into canonical Act assets unless the shared contract explicitly adopts it later

Runtime sync uses the same `ActDefinition` shape:

- Studio builds the full current runtime definition from workspace state
- Studio sends it to the runtime sync boundary for the target Act
- Runtime replaces the active or idle thread definition in place
- Completed and interrupted threads remain historical snapshots

Thread runtime state includes:

- mailbox messages
- shared board entries
- wake conditions
- `participantSessions`
- event history
- thread status

These runtime fields must never be written into installed or published Act assets.
Within runtime persistence, `board.json` is the only durable source of truth for board entries.

## Runtime Collaboration Tools

Participant sessions receive four generic collaboration tools:

- `message_teammate`
- `update_shared_board`
- `read_shared_board`
- `wait_until`

`message_teammate` recipient rules:

- pass the participant display name exactly as shown in the current agent context
- do not pass relation names such as `participant_1_to_participant_2`

Runtime behavior rules:

- tool identity is session-bound; models do not receive act ids or thread ids as tool arguments
- `read_shared_board` defaults to a recent summarized view when no key is provided
- participants should request a specific board key when they know the exact shared note they need
- `update_shared_board` should prefer `replace` with a fresh summary over long incremental `append` logs
- `append` is intended only for short additive updates
- `wait_until` is the preferred way for a participant to self-wake when blocked on a future message, board key, timeout, or composed condition
- same-participant wake serialization is a runtime scheduler concern, not prompt content
- direct message wakes should render the actual message body directly instead of a duplicated event summary plus mailbox-status framing
- `runtime.idle` remains a system trigger. It may wake subscribed participants, but it is not part of ordinary participant-facing coordination signals

## Boundary Rules

### Import from installed or registry asset

Canonical `ActAssetV1`
→ parse with `parseActAsset`
→ convert participant array to Studio participant record
→ assign runtime-only relation ids
→ store as workspace Act

### Save as Studio draft

Workspace Act
→ keep Studio-only draft shape
→ allowed to preserve `performerRef`, relation `id`, and workspace-only metadata

Drafts are Studio-local authoring state, not canonical assets.

### Save local asset or publish

Workspace Act
→ convert participant record to canonical participant array
→ convert `performerRef` to canonical performer URN
→ strip relation ids and workspace-only metadata
→ emit canonical `ActAssetV1`
→ validate again at the contract boundary

### Create thread

Workspace Act
→ build runtime `ActDefinition`
→ send to `/api/act/:actId/threads`
→ create or select participant sessions lazily during chat

### Sync thread runtime definition

Workspace Act
→ build full runtime `ActDefinition`
→ send to `/api/act/:actId/runtime-definition`
→ runtime reconciles active and idle threads only
→ relation, subscription, rule, and safety changes apply immediately
→ linked performer authoring-description changes also update participant prompt context for attached live Acts
→ participant performer changes retire the old participant session and lazily create a new one on next use
→ participant key renames are treated as remove + add

## Ownership Rules

- `dot` owns the canonical asset schema
- `registry` owns publish-time validation at the shared boundary
- `studio` owns workspace-only shape, canvas behavior, editor behavior, and runtime-only thread state
- `safety` is runtime-only unless and until it becomes part of the canonical contract

## Implementation Rules

1. Parse installed and registry Act assets with `parseActAsset`.
2. Treat parser failures as real contract failures.
3. Build local-save and publish payloads in canonical shape only.
4. Never write `performerRef`, relation `id`, canvas metadata, or workspace metadata into canonical Act assets.
5. Allow opposite-direction one-way relations in Studio.
6. Treat subscriptions as wake-up filters, not relation permission metadata.
7. Treat participant display labels, participant prompt descriptions, shared board state, and wake conditions as runtime-only unless the canonical contract changes.
8. Studio uses `workspace` terminology for local state, but canonical URNs still use `stage` as the third segment.
9. Runtime thread persistence is a full-rewrite boundary. Incompatible persisted runtime snapshots must be discarded, not compatibility-loaded.
