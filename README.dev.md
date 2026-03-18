# AGENT.md

Internal guide for working in `/Users/junhoyoon/windsurfpjt/dance-of-tal/studio`.

## Boundary

- Studio owns stage state, canvas UX, drafts, and composition.
- Studio also owns safe-mode shadow workspace orchestration, pending diff review, and apply/discard flows.
- OpenCode owns model execution, sessions, provider auth, tools, and live MCP runtime.
- DOT owns local/global asset formats and registry semantics.
- Hono is the BFF/application boundary, not the execution authority.

If behavior depends on models, tools, or MCP availability, trust OpenCode or DOT over Studio-side guesses.
Studio does not intercept OpenCode tool output or re-sequence performer execution at runtime. See PRD-001 for details.

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

- Performer and Act both support `executionMode: 'direct' | 'safe'`.
- Act copies performer config at add time (complete copy, not reference).
  - Performers can be added by dragging standalone performers into Act edit mode, or creating new ones inside Act.
  - Performer/Act **drafts** can also be dragged onto the canvas to create performers/acts from saved draft content.
  - Agent config (Tal, Dance, model, MCP) is owned by Act after copy. Standalone changes don't affect Act.
  - `derivedFrom` metadata records original performer id/urn (provenance only, no runtime link).
  - Sessions are Act-scoped (separate from the performer's standalone chat).
  - Workspace (safe/direct) is Act-scoped (individual performer's mode is ignored in Act).
  - To change Act performer config, edit directly inside Act.
- Safe mode ownership is owner-first:
  - performer safe mode is performer-scoped
  - act safe mode is act-scoped
  - safe state is not thread-scoped

## Runtime Rules

- Current refs drive runtime.
- Tal is always-on system context.
- Dance is projected to OpenCode native skills.
- Runtime projection is OpenCode-native:
  - Tal → generated agent prompt body (no boilerplate — Tal content only, with relation prompt for Acts)
  - Dance → generated skill (SKILL.md)
  - Performer → generated agent (build + plan for stage, build-only for Act)
- Performer chat and act runtime are separate session models.
- **Correction over v1**: OpenCode natively tracks `{agent, model, variant}` on a **per-message** basis. Changing Tal, Dance, MCP (which generates a new agent name) or changing the model/variant mid-session **does not** require rolling the OpenCode session. The new config applies naturally to the next turn.
- OpenCode remains the execution authority in both direct and safe modes.
- Safe mode changes the execution directory, not the execution engine.
- Studio compiles Performer config into OpenCode native agent/skill projections. See PRD-001 §6.
- At chat send time, Studio passes only the compiled `agent` name. The projected agent `.md` file already contains the model, variant, tools, and system prompt — no inline override is passed to `promptAsync()`.
- Model `variant` (e.g., `full-thinking`, `normal`) is set in the agent `.md` frontmatter `variant:` field. OpenCode reads it at prompt time.
- No custom assistant tools are projected. Performers and the Studio Assistant rely on OpenCode built-in tools (bash, edit, read, etc.).
- Delegation tools (Act relations) are the only custom tool files Studio projects.

## Projection Architecture

All Studio-generated files live under `.opencode/` namespaced by `dot-studio/`.

### File Layout

```
.opencode/
  agents/dot-studio/
    studio-assistant.md                              # Studio Assistant agent
    stage/<hash>/<performerId>--build.md              # Stage performer (build posture)
    stage/<hash>/<performerId>--plan.md               # Stage performer (plan posture)
    act/<hash>/<actId>/<performerId>--build.md        # Act performer (build only)
  skills/dot-studio/
    studio-assistant-<name>/SKILL.md                  # Studio Assistant dance-skills
    stage/<hash>/<performerId>/<danceName>/SKILL.md   # Performer dance-skills
  tools/
    dot_studio__<hash>__<actId>__<name>.ts             # Act delegation tools only
```

### Agent Posture Rules

| Scope | Postures | Rationale |
|-------|----------|-----------|
| Stage performer | `build` + `plan` | OpenCode `/plan` mode support |
| Act performer | `build` only | Multi-performer Acts make plan mode impractical |
| Studio Assistant | single agent | No posture distinction |

### Agent Body Content

Agent `.md` body contains only:
1. **Tal content** — the always-on system context (no `# Runtime Instructions` or `# Core Instructions` boilerplate)
2. **Relation prompt** (Act only) — delegation instructions injected by `relation-compiler.ts`

### Dispose & Hot-Reload

- OpenCode **does not** hot-reload agent/skill files. `instance.dispose()` is required for changes to take effect.
- Studio calls `oc.instance.dispose()` after projection file changes (in `stage-projection-service.ts`).
- Dispose clears all cached state and emits `server.instance.disposed` → SSE streams close → frontend connection drops.
- **Known limitation**: dispose is instance-wide. If Performer A is streaming while Performer B's config is saved, Performer A's SSE stream will also close. LLM responses continue server-side and are saved to DB, but real-time UI streaming is interrupted.
- `global.dispose()` is used separately for auth/config changes (in `opencode.ts`).

## Safe Mode Rules

- Direct mode runs against the real `workingDir`.
- Safe mode runs against a server-managed shadow workspace under `~/.dot-studio/safe-mode`.
- Safe mode shadow workspaces are Git-backed private workspaces created from the current real workspace snapshot.
- Do not copy the source repo `.git` into the shadow workspace.
- Performer safe mode:
  - one performer owns one shadow workspace
  - all performer sessions share that shadow workspace
  - only the current active performer session is treated as the undo-capable lineage
- Act safe mode:
  - one act owns one shadow workspace
  - all act sessions share that shadow workspace
  - act v1 does not expose undo; review/apply/discard only
- Diff review compares `base` snapshot vs `shadow` workspace.
- Apply compares `real` vs `base` vs `shadow` and may auto-merge non-overlapping text changes.
- Conflict state is file-scoped. Clean files may still apply when another file conflicts.
- Safe-mode apply/discard/reset operations should invalidate the current owner lineage and force the next run into a new OpenCode session lineage.

## Session Routing Rules

- Session-bound OpenCode routes must prefer Studio's session execution registry over raw request `workingDir` when a session has a registered execution directory.
- Forked performer sessions inherit the same execution directory as the source session.
- Chat event subscriptions and session lists should include both the real workspace directory and any registered performer execution directories for that stage.
- Act-created OpenCode sessions should register as `ownerKind='act'`.

## Execution Context Rules

- Performer standalone chat: performer's own safe/direct setting applies.
- @mention (performer → performer): callee runs in **caller's workspace**. Callee's own safe/direct setting is ignored.
- Act thread: Act sets safe/direct for the whole thread. All participating performers run in **Act's workspace**. Individual performer safe/direct is ignored inside Act.
- UI meaning:
  - performer safe/direct is the default mode for standalone execution
  - mention flows should clearly communicate "Runs in the caller's workspace"

## Undo Rules

- Studio does not expose generic chat-only undo.
- Performer undo/redo is exactly OpenCode `session.revert` and `session.unrevert`.
- `Undo Last Turn` should revert both chat history and file state to the previous turn boundary.
- In performer UI, undo belongs to the last visible turn affordance, not global header chrome.
- Act does not expose undo in v1 safe mode.
- Direct mode undo is only as reliable as OpenCode's underlying Git-based revert support for the real workspace.

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
- Draft performers and acts can be dragged from AssetLibrary onto the canvas to create new performers/acts from draft content.
- In Act edit mode, performer assets (including drafts) can be dropped onto the canvas to add new Act performers, or onto existing Act performers to apply config.
- Asset Library is the supply surface for Tal, Dance, Performer, Act, model, and MCP.
- MCP CRUD lives in Asset Library, not Settings.
- Threads sidebar child rows are renameable inline.
- Selected MCP bindings can be removed from performer cards. Imported placeholders cannot; they must be mapped.
- Safe mode controls should use the existing runtime control / modal design system.
- Do not introduce a separate visual language for safe mode.
- Performer UI:
  - safe/direct toggle belongs in the runtime control row
  - `Undo Last Turn` belongs on the last message turn affordance
  - safe review uses modal patterns already used elsewhere in Studio
- Act UI:
  - safe/direct toggle and review affordances may live in existing act header/runtime controls
  - do not add act undo controls in v1

## Draft CRUD

Drafts are project-local authoring assets stored on disk at `.dance-of-tal/drafts/<kind>/<id>.json`. They are **not** inline in stage files or memory-only.

### Storage

```
.dance-of-tal/drafts/
  ├── tal/        # Markdown string content
  ├── dance/      # Markdown string content
  ├── performer/  # Structured PerformerDraftContent object
  └── act/        # Structured ActDraftContent object
```

### Typed Content (`shared/draft-contracts.ts`)

`DraftFile<T = unknown>` is generic. Use `TypedDraftFile<K>` for kind-safe access:

| Kind | Content Type | Shape |
|------|-------------|-------|
| `tal` | `string` | Markdown text |
| `dance` | `string` | Markdown text |
| `performer` | `PerformerDraftContent` | `{ talRef, danceRefs, model, mcpServerNames, ... }` |
| `act` | `ActDraftContent` | `{ executionMode, entryPerformerKey, performers, relations }` |

### Server API (`server/routes/drafts.ts` → `server/services/draft-service.ts`)

| Method | Route | Action |
|--------|-------|--------|
| GET | `/api/drafts` | List all drafts |
| GET | `/api/drafts/:kind/:id` | Get single draft |
| POST | `/api/drafts` | Create (optional caller-specified `id`) |
| PUT | `/api/drafts/:kind/:id` | Update |
| DELETE | `/api/drafts/:kind/:id` | Delete |

### Client API (`src/api.ts` → `api.drafts`)

Mirrors server routes. Client store methods:

| Method | Purpose |
|--------|---------|
| `upsertDraft()` | Memory update + 1.5s debounced disk persist |
| `savePerformerAsDraft()` | Copy performer config to draft |
| `saveActAsDraft()` | Copy act config to draft |
| `loadDraftsFromDisk()` | Load all drafts from disk into store |
| `addPerformerFromDraft()` | Create canvas performer from draft content |
| `importActFromDraft()` | Create canvas act from draft content |

### Auto-Save (`src/store/draft-auto-save.ts`)

- Zustand subscriber watches performer config changes
- If `meta.derivedFrom` is present (performer derived from named asset), triggers debounced auto-save
- Draft ID: `auto-{performerId}` — stable per performer
- Includes `derivedFrom` field in draft

### Draft Lifecycle

1. **Create** — Markdown editor "New Tal/Dance", StageExplorer Archive button, or auto-save
2. **Read** — Server resolves `{ kind: 'draft', draftId }` refs from disk at projection time
3. **Update** — `upsertDraft()` debounces to disk; explicit `api.drafts.update()`
4. **Delete** — AssetLibrary "Delete Draft" button; automatic on promotion
5. **Promote** — "Save Local Fork" on a draft asset deletes the draft file after save
6. **Import** — Drag draft from AssetLibrary onto canvas creates performer/act from draft content

### Stage Load Integration

- `loadStage()` and `newStage()` call `loadDraftsFromDisk()` automatically
- Legacy `Stage.drafts` (inline in JSON) are migrated to disk on load

### Draft Resolution at Projection

Server reads draft content from `.dance-of-tal/drafts/<kind>/<id>.json` when encountering `AssetRef { kind: 'draft', draftId }`. No inline `drafts` dictionary is passed in chat/projection requests.

## Publish Rules

- Tal/Dance drafts are stage-local authoring assets.
- Performer/Act publish compiles current canvas state into DOT payloads.
- Unresolved imported MCP placeholders block performer publish.
- Act publish must also fail if any bound performer still has unresolved MCP placeholders.

### Act Publish Validation (Blocking)

Act publish/save is blocked when any of these conditions are met:

| Rule | Condition |
|------|-----------|
| No performers | `Object.keys(act.performers).length === 0` |
| No relations | `act.relations.length === 0` |
| Disconnected performer | Performer exists in Act but has no relations (in or out) |
| Dangling relation | Relation references a performer not in Act |
| Missing model | Any Act performer has `model === null` |

Validation is implemented in `src/components/modals/publish-modal-utils.tsx` (`getActPublishBlockReasons`).

### Performer Publish Validation

- Performer model not set → warning in picker
- Blocking dependencies (unpublished Tal/Dance) → blocks publish
- Unresolved MCP placeholders → blocks publish

## Act Architecture

An Act defines a performer relation graph. Relations (edges) are projected as Custom Tool → Hono BFF → OpenCode SDK for subagent execution. Act performers generate only `build` posture agents (no `plan`). See PRD-001 §7 for full details.

### Act Entity

Act is a first-class canvas node:

- DOT asset / publish target
- Safe-mode owner (`ownerKind='act'`)
- Thread owner
- Canvas node with ⚡ icon, three states: collapsed (badges), chat mode, edit mode
- Edit mode shows performer edit cards + relation arrows on React Flow canvas
- Relations live exclusively inside Act — no standalone performer-to-performer edges exist
- Schema v5: `performerLinks` removed from Stage, Act stores `relations` inline + `position/width/height`

### Performer Reference

Act copies performer config at addition (not reference):

| Item | Owner | Notes |
|------|-------|-------|
| Agent config | Act (copied) | Standalone changes don't affect Act |
| Session | Act | Act-scoped; independent from performer's standalone chat |
| Workspace | Act | Act-scoped safe/direct; performer's own mode is ignored |
| Provenance | metadata | `derivedFrom` records original performer id/urn (no runtime link) |

### Tal / Edge Role Separation

- **Tal** = performer가 무엇을 하는지 (정체성, 역할, 규칙) — standalone과 Act에서 재사용 가능
- **Edge** = performer가 누구에게 무엇을 시킬 수 있는지 (delegation semantics) — Act-specific
- Tal에 다른 performer에 대한 delegation 지시를 넣지 않는다
- Edge의 `name`이 custom tool 이름, `description`이 tool description이 된다

### Edge Attribute Model

Relations use an attribute-based model instead of fixed interaction types:

```ts
interface ActRelation {
    id: string
    from: string
    to: string
    name: string                          // custom tool name
    description: string                   // tool description for LLM
    invocation: 'optional' | 'required'   // prompt injection strength
    await: boolean                        // wait for result
    sessionPolicy: 'fresh' | 'reuse'     // subagent session management
    maxCalls: number                      // max invocations (default 10)
    timeout: number                       // seconds (default 300)
}
```

### Relation Projection — Custom Tool + BFF

Act relations are projected as:

1. Custom tool file — `.opencode/tools/dot_studio__<hash>__<name>.ts`
2. Agent prompt section — relation semantics injected into agent `.md` body
3. `permission.task` allowlist — callable targets constrained (defense in depth)

Execution flow: LLM calls custom tool → tool fetches `POST /api/act/delegate` on Hono BFF → BFF uses OpenCode SDK (`session.create()` + `session.prompt()`) → subagent runs → result returned.

BFF manages: session creation/reuse (`sessionPolicy`), call counting (`maxCalls`), timeout (`AbortController`), async fire-and-forget (`await: false`).

### Multi-Depth Chaining

Subagent chaining (A→B→C) is supported:

- A's projection includes B as custom tool + `permission.task`
- B's projection includes C as custom tool + `permission.task` (B's outgoing edge)
- Each custom tool BFF call independently manages sessions
- Depth bounded by graph structure + `maxCalls` + `agent.steps`

### Safety

| Guard | Implementation |
|-------|----------------|
| Loop prevention | Edge `maxCalls` (BFF enforced) |
| Time limit | Edge `timeout` (BFF `AbortController`) |
| Total budget | Performer `agent.steps` (OpenCode agent setting) |
| Error propagation | BFF returns error string → LLM decides next action |

## Act Runtime Rules

### Execution

- Act runtime is no longer an XState state machine.
- Execution is driven by **Custom Tool → BFF → OpenCode SDK** mechanism.
- Studio compiles Act relations into custom tool files + agent prompt sections + `permission.task` allowlists.
- Custom tools call `POST /api/act/delegate` on the Hono BFF.
- BFF uses OpenCode SDK (`session.create()` + `session.prompt()`) to execute subagents.
- BFF manages session lifecycle: creation/reuse (`sessionPolicy`), call counting (`maxCalls`), timeout.

### Orchestrator Replacement

The orchestrator node pattern (LLM selects next target via JSON) is replaced by:

- Per-relation custom tools for named delegation (e.g., `request_code_review`)
- `permission.task` for defense-in-depth target restriction
- `invocation: required` for mandatory workflow steps (prompt injection)
- Standard tool call interface instead of JSON response parsing

### Session Management

Act sessions are simplified from the previous 2D model (policy × lifetime):

- No more fine-grained `fresh` / `node` / `performer` / `act` policy matrix
- Standalone performer chat uses one standalone performer session model
- Act subagent sessions are managed by BFF `delegate-service.ts`:
  - `sessionPolicy: 'fresh'` → new session per call
  - `sessionPolicy: 'reuse'` → same session across multiple calls (context preserved)
- Standalone performer chat sessions are not shared with Act
- Act execution mode (`direct`/`safe`) is set per-Act, not per-performer within Act.

### Payload Schema

Act publish supports two payload schemas:

| Schema | Fields | Used By |
|--------|--------|---------|
| Legacy | `entryNode`, `nodes`, `edges` | Older assets |
| `studio-v1` | `schema: 'studio-v1'`, `performers`, `relations` | Current Studio canvas |

Both `dot-authoring.ts` normalizer and `asset-service.ts` reader handle both formats.

## Read First

- [prd/001-opencode-native-projection.md](./prd/001-opencode-native-projection.md)
- [shared/draft-contracts.ts](./shared/draft-contracts.ts)
- [src/types/index.ts](./src/types/index.ts)
- [src/store/workspaceSlice.ts](./src/store/workspaceSlice.ts)
- [src/store/chatSlice.ts](./src/store/chatSlice.ts)
- [src/store/actSlice.ts](./src/store/actSlice.ts)
- [src/store/performerRelationSlice.ts](./src/store/performerRelationSlice.ts)
- [src/store/safeModeSlice.ts](./src/store/safeModeSlice.ts)
- [src/store/draft-auto-save.ts](./src/store/draft-auto-save.ts)
- [src/lib/performers.ts](./src/lib/performers.ts)
- [src/lib/dnd-handlers.ts](./src/lib/dnd-handlers.ts)
- [src/components/panels/AssetLibrary.tsx](./src/components/panels/AssetLibrary.tsx)
- [src/components/panels/AssetCards.tsx](./src/components/panels/AssetCards.tsx)
- [src/components/panels/asset-library-utils.ts](./src/components/panels/asset-library-utils.ts)
- [src/components/modals/publish-modal-utils.tsx](./src/components/modals/publish-modal-utils.tsx)
- [src/features/performer/AgentFrame.tsx](./src/features/performer/AgentFrame.tsx)
- [src/features/act/ActFrame.tsx](./src/features/act/ActFrame.tsx)
- [src/features/act/ActEditPanel.tsx](./src/features/act/ActEditPanel.tsx)
- [src/features/act/ActChatPanel.tsx](./src/features/act/ActChatPanel.tsx)
- [src/components/modals/SafeReviewModal.tsx](./src/components/modals/SafeReviewModal.tsx)
- [server/routes/chat.ts](./server/routes/chat.ts)
- [server/routes/drafts.ts](./server/routes/drafts.ts)
- [server/routes/safe.ts](./server/routes/safe.ts)
- [server/services/chat-service.ts](./server/services/chat-service.ts)
- [server/services/draft-service.ts](./server/services/draft-service.ts)
- [server/services/opencode-projection/stage-projection-service.ts](./server/services/opencode-projection/stage-projection-service.ts)
- [server/services/opencode-projection/performer-compiler.ts](./server/services/opencode-projection/performer-compiler.ts)
- [server/services/opencode-projection/dance-compiler.ts](./server/services/opencode-projection/dance-compiler.ts)
- [server/services/opencode-projection/relation-compiler.ts](./server/services/opencode-projection/relation-compiler.ts)
- [server/services/opencode-projection/act-compiler.ts](./server/services/opencode-projection/act-compiler.ts)
- [server/services/opencode-projection/projection-manifest.ts](./server/services/opencode-projection/projection-manifest.ts)
- [server/services/studio-assistant/assistant-service.ts](./server/services/studio-assistant/assistant-service.ts)
- [server/lib/safe-mode.ts](./server/lib/safe-mode.ts)
- [server/lib/dot-authoring.ts](./server/lib/dot-authoring.ts)
- [server/lib/session-execution.ts](./server/lib/session-execution.ts)
- [server/lib/runtime-tools.ts](./server/lib/runtime-tools.ts)
