# Studio Act Contract Guide

## Purpose

This document defines the canonical `act` model that Studio must use.

Studio must stay aligned with:

- `dot` contract types in `dance-of-tal/contracts`
- `registry` publish validation
- Studio runtime/import/export behavior

Full rewrite policy applies.
Do not add migration fallbacks for old act shapes.

## Single Source of Truth

Canonical asset schema lives in:

- `dot/src/contracts/act.ts`

Studio may extend that schema for runtime-only fields, but it must not redefine the asset shape.

## Canonical Asset Shape

### Act participant

```ts
type ActParticipantV1 = {
  key: string
  performer: string
  subscriptions?: {
    messagesFrom?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: Array<'runtime.idle'>
  }
}
```

Rules:

- use `key`, never `id`
- `performer` must be a canonical performer URN
- `eventTypes` currently only supports `runtime.idle`

### Act relation

```ts
type ActRelationV1 = {
  between: [string, string]
  direction: 'both' | 'one-way'
  name: string
  description: string
}
```

Rules:

- `description` is required
- `direction` is required
- relation order matters for `one-way`
- opposite one-way relations are valid and must be allowed

### Asset payload

```ts
type ActAssetPayloadV1 = {
  actRules?: string[]
  participants: ActParticipantV1[]
  relations: ActRelationV1[]
}
```

Structural invariants:

- participant keys must be unique
- every relation endpoint must reference an existing participant key
- acts with multiple participants must include at least one relation

## Forbidden Legacy Fields

These must not be accepted, written, or reintroduced:

- participant `id`
- participant `activeDances`
- relation `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`

## Studio Runtime Extensions

Studio-only runtime state is allowed outside the asset contract:

- `ActRelation = ActRelationV1 & { id: string }`
- `ActDefinition.participants: Record<string, ActParticipantBinding>`
- `ActDefinition.safety?: ActSafetyConfig`
- canvas position/size metadata

These runtime fields must never be written into registry/local act assets.

## Data Flow

### Publish

Studio `StageAct`
→ convert participant record to array
→ strip runtime-only relation ids
→ emit canonical `ActAssetV1`

### Import

Canonical `ActAssetV1`
→ parse with dot contract
→ convert participant array to Studio record
→ assign runtime-only relation ids

## Ownership Rules

- `dot` owns asset schema
- `registry` owns publish-time semantic validation
- `studio` owns runtime-only fields and canvas/editor behavior
- safety is runtime-only, not part of the act asset

## Implementation Rules

1. Parse installed and registry act assets through `parseActAsset`.
2. Build published act payloads in canonical shape only.
3. Do not preserve or silently ignore removed legacy fields.
4. Allow opposite-direction one-way relations in Studio.
5. Treat subscription as a wake-up filter, not as relation permission metadata.
