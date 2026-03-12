# AGENT.md

Internal guide for working in `/Users/junhoyoon/windsurfpjt/dance-of-tal/studio`.

## Boundary

- Studio owns stage state, canvas UX, drafts, and composition.
- OpenCode owns model execution, sessions, provider auth, tools, and live MCP runtime.
- DOT owns local/global asset formats and registry semantics.
- Hono is the BFF/application boundary, not the execution authority.

If behavior depends on models, tools, or MCP availability, trust OpenCode or DOT over Studio-side guesses.

## Architecture Direction

- Keep the current macro architecture:
  - React client
  - Zustand domain state
  - Hono BFF
  - OpenCode runtime adapter
  - shared cross-runtime contracts/utilities
- Treat the current structure as valid for the product stage:
  - do not rewrite the stack
  - do not move execution authority out of OpenCode
  - prefer modularity and boundary cleanup over platform churn
- Prefer boundary cleanup and domain modularity over framework churn.
- Do not move runtime authority into the browser.
- Do not split the app into separate services unless there is a concrete deployment/runtime need.

### Target Boundary Model

- `src`
  - rendering, interaction state, canvas UX, client orchestration
- `src/store`
  - Studio domain state only
- `src/api.ts`
  - transport client only
- `server/routes`
  - request/response translation only
- `server/services` or `server/lib`
  - application orchestration, projection, OpenCode/DOT integration
- `shared`
  - contracts, metadata, schema definitions, request/response shapes

If new behavior starts making route modules act like application services, extract service modules instead of pushing more orchestration into the route layer.

### Layer Intent

- `src/components` / `src/features`
  - rendering and local interaction state
- `src/store`
  - Studio domain state and client-side orchestration
- `src/api.ts`
  - transport client only
- `server/routes`
  - request/response translation only
- `server/services` or `server/lib`
  - orchestration, projection, OpenCode/DOT integration
- `shared`
  - cross-runtime contracts, metadata, schema definitions, request/response shapes

### Modularity Rules

- Prefer domain modularity over technical sprawl:
  - performer
  - act
  - assets
  - providers
  - chat
  - runtime events
- Keep route handlers thin. Reusable orchestration belongs in service/lib modules.
- Keep runtime event parsing and UI state mutation separable where possible.
- Shared contracts should move into `shared/` instead of being duplicated across `src/` and `server/`.
- Future work should prefer `features/<domain>` style organization over continually growing global `components/`, `store/`, and `lib/`.
- New state domains should get their own slice instead of being absorbed into chat/runtime slices by default.

## Core Model

- One stage exists per `workingDir`.
- Runtime is ref-first:

```ts
type AssetRef =
  | { kind: 'registry'; urn: string }
  | { kind: 'draft'; draftId: string }
```

- Performer runtime inputs:
  - `talRef`
  - `danceRefs`
  - `model` or `modelPlaceholder`
  - `mcpServerNames`
- `declaredMcpConfig` is imported provenance, not runtime authority.
- Acts reference performers by `performerId`. Act-owned performers are cloned bindings.

## Runtime Rules

- Current refs drive runtime.
- Tal is always-on system context.
- Dance is cataloged first and loaded on demand through `read`.
- Performer chat and act runtime are separate session models.
- Changing Tal, Dance, model, or MCP selection rolls the OpenCode session.

## MCP Rules

- Source of truth: project `config.json` native `mcp` field.
- Main UI: `Asset Library > Runtime > MCPs`.
- Runtime stores only selected `mcpServerNames`.
- Resolve tools lazily at compile/runtime.
- Unavailable MCP reasons must stay explicit:
  - `not_defined`
  - `disabled`
  - `needs_auth`
  - `connect_failed`
  - `connected_but_no_tools_for_model`

Imported performer or act assets may carry `mcp_config`. Map names that exist in the project catalog. Leave the rest as placeholders.

## Future Planning

### Performer Adapter View (Planned Only)

This repository should remain compatible with a future `Performer Adapter View` system, but adapter code should not be added until explicitly requested.

#### Intended Model

- Dance defines the adapter **blueprint**.
- Performer owns the adapter **instance**.
- Server projects runtime/tool/MCP results into adapter state.
- Client renders adapter panels from a declarative schema.
- Do not bind adapter instance state directly to Dance assets.

#### Future Direction

- `Dance`
  - may eventually contain optional `view` / adapter schema
- `Performer`
  - may eventually store adapter layout, visibility, and instance binding state
  - is the correct owner for per-session or per-runtime adapter state bindings
- `shared`
  - should be the home for future adapter schemas and contracts
- `server`
  - should project runtime state into adapter-facing view models
  - should own adapter projection logic, not the browser
- `src`
  - should render adapter schemas and dispatch adapter actions
  - should not interpret raw MCP output as UI state on its own

#### Constraints

- Do not embed arbitrary React or JS execution in Dance assets.
- Adapter UI should be declarative and schema-driven.
- Runtime/server remains the source of truth for adapter state.
- Client adapter state should be presentation/cache state only.
- Prefer event separation:
  - chat stream
  - act runtime stream
  - future adapter view stream
- Do not collapse future adapter events into existing chat-only flows unless explicitly justified.

#### If Implemented Later

- Prefer adding:
  - `shared/adapter-view.ts`
  - `server/services/adapter-view-service.ts`
  - `src/features/adapter-view/`
  - `src/store/adapterViewSlice.ts`
- Do not fold future adapter logic into existing chat-only flows by default.
- Keep adapter events separate from plain chat stream handling.
- The right ownership model is:
  - `Dance = blueprint`
  - `Performer = instance`
  - `Server = projection/source of truth`
  - `Client = renderer + action dispatch`

## UI Rules

- Performer and act-performer composition is drag-and-drop first.
- Asset Library is the supply surface for Tal, Dance, Performer, Act, model, and MCP.
- MCP CRUD lives in Asset Library, not Settings.
- Threads sidebar child rows are renameable inline.
- Selected MCP bindings can be removed from performer cards. Imported placeholders cannot; they must be mapped.

## Publish Rules

- Tal/Dance drafts are stage-local authoring assets.
- Performer/Act publish compiles current canvas state into DOT payloads.
- Unresolved imported MCP placeholders block performer publish.
- Act publish must also fail if any bound performer still has unresolved MCP placeholders.

## Act Architecture

An Act is a directed graph of nodes connected by edges. Runtime executes nodes sequentially via an XState state machine (`act-runtime.ts`).

### Node Types

| Type | Role | Has Performer | Key Fields |
|------|------|:---:|------------|
| **Worker** | Executes a single LLM call | ✅ | `performerId`, `sessionPolicy`, `sessionLifetime` |
| **Orchestrator** | Routes to one outgoing flow edge via LLM JSON decision | ✅ | `maxDelegations`, `sessionPolicy` |
| **Parallel** | Fork-join: runs all outgoing `role='branch'` edges concurrently, merges results | ❌ | `join: all\|any` |

### Edge Routing

```ts
type StageActEdge = {
    from: string      // source node ID
    to: string        // target node ID or '$exit'
    role?: 'branch'   // marks fan-out edges for parallel nodes
    condition?: 'always' | 'on_success' | 'on_fail'
}
```

- `selectNextTarget()` priority: `on_success/on_fail` > `always` > no condition
- No matching edge → Act exits (same as `$exit`)
- Orchestrator selects among outgoing non-`branch` edges via LLM response `{next, input, session}`
- Parallel starts one sub-run per outgoing `role='branch'` edge and uses regular edges for post-join transitions

### Data Invariants (`syncStageActStructure`)

- Orphan edges (referencing deleted nodes) are auto-cleaned
- Edge dedup uses `from:to:role:condition`
- `entryNodeId` falls back to first node if the referenced node is deleted

## Act Runtime Rules

### Execution Loop

1. Start at `entryNodeId` with user input as `pendingInput`
2. `advanceRuntimeStep()` executes the current node
3. Output flows to the next node as `pendingInput`
4. Loop until `$exit`, error, or `maxIterations` exceeded

### Worker Execution

`invokePerformer()` → text output → follow edges via `selectNextTarget(success/fail)`

### Orchestrator Execution

`invokePerformer(orchestratorPrompt)` → JSON `{next, input, session}` → route to one outgoing non-`branch` edge target. `maxDelegations` limits how many times a single orchestrator can route before failing.

### Parallel Execution

1. All outgoing `role='branch'` edges run as independent sub-machines via `Promise.all`
2. Each branch is an isolated sub-run (own `runId`, `sessionPool`, no UI events)
3. `join: all` — all must succeed; outputs concatenated
4. `join: any` — one success suffices; first successful branch's output used
5. Branch history merges back into parent context

### Session Management

Two dimensions: **policy** (scope) × **lifetime** (persistence).

| Policy | Scope |
|--------|-------|
| `fresh` | New session every invocation |
| `node` | Shared across invocations of the same node |
| `performer` | Shared across nodes using the same performer |
| `act` | Single session for the entire Act |

| Lifetime | Persistence |
|----------|-------------|
| `run` | Scoped to the current run only |
| `thread` | Persists across runs in the same act thread |

Session reuse requires matching `configKey` (model + tal + dance + mcp + agent combination). Config change → session invalidated.

### Safety Invariants

- `maxIterations` is the global safety net for the entire Act run
- `maxDelegations` limits individual orchestrator routing count
- Orchestrator route validation rejects targets that are not reachable via outgoing non-`branch` edges
- Parallel branch runs cannot leak sessions to the parent thread (`actSessionId: null`)

## Read First

- [src/types/index.ts](./src/types/index.ts)
- [src/store/workspaceSlice.ts](./src/store/workspaceSlice.ts)
- [src/store/chatSlice.ts](./src/store/chatSlice.ts)
- [src/lib/performers.ts](./src/lib/performers.ts)
- [src/lib/acts.ts](./src/lib/acts.ts)
- [src/components/panels/AssetLibrary.tsx](./src/components/panels/AssetLibrary.tsx)
- [src/components/canvas/AgentFrame.tsx](./src/components/canvas/AgentFrame.tsx)
- [src/components/canvas/ActAreaFrame.tsx](./src/components/canvas/ActAreaFrame.tsx)
- [server/routes/opencode.ts](./server/routes/opencode.ts)
- [server/lib/act-runtime.ts](./server/lib/act-runtime.ts)
- [server/lib/runtime-tools.ts](./server/lib/runtime-tools.ts)
