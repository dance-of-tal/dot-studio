# Studio Assistant Guide

## Purpose

Studio Assistant is a runtime-only chat target that helps mutate the Studio canvas.

It is not a persisted performer asset.
It does not publish to DOT.
It exists only as:

- a projected OpenCode agent
- a small set of builtin assistant skills
- a client-side action application protocol
- a server-side prompt layer that can inject workspace and asset discovery hints

## Identity

- performer id: `studio-assistant`
- UI entry: toolbar assistant toggle
- state owner:
  - `src/store/assistantSlice.ts`

The assistant stores only runtime UI state:

- open/closed state
- selected model
- dedupe map for already-applied action messages
- action apply result summaries

## File Map

- server projection:
  - `server/services/studio-assistant/assistant-service.ts`
- assistant Tal:
  - `server/services/studio-assistant/tal/studio-assistant.md`
- builtin assistant skills source:
  - `server/services/studio-assistant/dances/*/SKILL.md`
  - `assistant-service.ts` prefers these Agent Skill directories and only falls back to legacy flat `dances/*.md` files when a matching skill directory does not exist
- client UI:
  - `src/features/assistant/AssistantChat.tsx`
- action protocol parsing:
  - `src/features/assistant/assistant-protocol.ts`
- action application:
  - `src/features/assistant/assistant-actions.ts`
- stage context contract:
  - `shared/assistant-actions.ts`
- assistant runtime target resolution:
  - `src/store/chat/chat-runtime-target.ts`
- assistant send-time prompt assembly:
  - `server/services/chat-service.ts`
- installed asset listing:
  - `server/services/asset-service.ts`
- registry and skills search:
  - `server/services/dot-service.ts`

## Runtime Flow

### 1. Open

The assistant panel opens from the toolbar.
The selected model lives in `assistantSlice`.

### 2. Resolve runtime target

When chat is sent to `studio-assistant`, `chat-runtime-target.ts` returns:

- `isAssistant: true`
- assistant runtime model
- stage snapshot summary as `assistantContext`

### 3. Build server prompt

`chat-service.ts` detects the assistant target and:

- ensures the assistant agent and builtin skills exist
- builds assistant system prompt sections from:
  - current stage snapshot
  - current action surface rules
  - optional asset discovery hints derived from the user message
- sends that prompt through the OpenCode `system` field
- sends only the user message as chat input

Unlike performer projection:

- no performer Tal or Dance refs are compiled here
- no Act runtime tools are injected
- the assistant mutates the canvas through the action block protocol, not custom tools

### 3.5. Interactive discovery

When the user message looks like a Tal, Dance, Performer, or Act discovery/setup request, Studio may inject concise discovery hints into the assistant system prompt:

- matching installed local assets
- matching registry assets
- matching `skills.sh` Dance candidates

These hints are advisory only.
The assistant should still ask a short clarifying question when multiple creation paths are reasonable.
They are not direct tool results and do not guarantee that a match is installable or correct.

### 4. OpenCode execution

The assistant runs as projected agent:

- `dot-studio/studio-assistant`

The selected runtime model is passed inline at send time.

### 5. Action block in reply

If the assistant wants to mutate the stage, it appends:

```html
<assistant-actions>{"version":1,"actions":[...]}</assistant-actions>
```

The block must be:

- raw JSON
- exactly one block
- placed at the end of the reply
- dependency-ordered when later actions rely on earlier ones

### 6. Client parsing

`assistant-protocol.ts`:

- extracts the block
- parses and validates the JSON envelope against supported action shapes
- strips the block from visible chat text

`chat-messages.ts` stores parsed actions in message metadata.

### 7. Client application

`AssistantChat.tsx` watches completed assistant messages.

For each unapplied assistant message:

- parse actions
- apply them with `assistant-actions.ts`
- mark the message as applied

Actions are applied sequentially in array order.
This means assistant-side “cascade” is expressed by putting dependent actions in one block and reusing same-message refs from earlier actions.

If some or all actions fail, Studio now:

- shows a warning or error toast
- renders an inline apply summary under the assistant message

## Supported Actions

Defined in `shared/assistant-actions.ts`.

Current action types:

- `installRegistryAsset`
- `addDanceFromGitHub`
- `importInstalledPerformer`
- `importInstalledAct`
- `createTalDraft`
- `updateTalDraft`
- `deleteTalDraft`
- `createDanceDraft`
- `updateDanceDraft`
- `deleteDanceDraft`
- `upsertDanceBundleFile`
- `deleteDanceBundleEntry`
- `createPerformer`
- `updatePerformer`
- `deletePerformer`
- `createAct`
- `updateAct`
- `deleteAct`
- `attachPerformerToAct`
- `detachParticipantFromAct`
- `updateParticipantSubscriptions`
- `connectPerformers`
- `updateRelation`
- `removeRelation`

Resolution rules:

- prefer explicit ids from stage snapshot
- same-message refs can be used for newly created performers, acts, and drafts
- same-message refs are the primary cascade mechanism for dependent mutations
- when creating a new Performer, prefer cascading Tal/Dance dependencies in the same block
- when creating a new Act, prefer cascading missing performers first, then creating the Act with participant refs
- exact names are fallback only when ids are not known
- install/import is a separate path from direct draft creation
- `addDanceFromGitHub` is the path for GitHub or `skills.sh` Dance installs
- imported installed assets can then be brought onto the canvas for Performer and Act
- `createDanceDraft` and `updateDanceDraft` are only for `SKILL.md`
- Dance bundle sibling files use `upsertDanceBundleFile` and `deleteDanceBundleEntry`
- Dance bundle file actions are limited to saved Dance drafts and relative bundle paths
- Dance bundle file actions must not target `SKILL.md` or `draft.json`

## Stage Context Shape

The assistant sees a compact stage snapshot:

- working directory
- performers
  - id
  - name
  - current model
  - tal URN
  - dance URNs
- acts
  - id
  - name
  - description
  - actRules
  - participant summaries
  - relation summaries
- drafts
  - id
  - kind
  - name
  - description
  - tags
  - saved drafts only
- available models
  - provider
  - providerName
  - modelId
  - display name

This context is for planning mutations, not for authoritative runtime execution.

## Projection Rules

Assistant projection is written under:

```text
.opencode/agents/dot-studio/studio-assistant.md
.opencode/skills/dot-studio/<skill-name>/SKILL.md
```

Rules:

- builtin assistant skills are authored as Agent Skills under `server/services/studio-assistant/dances/*/SKILL.md`
- builtin assistant skill bundles may also project sibling files such as `references/`, `scripts/`, `assets/`, and `agents/openai.yaml`
- source skill `name` must match its parent directory name so the projected runtime copy remains Agent Skill spec-compatible
- stale `studio-assistant-*` skill directories are removed during projection refresh
- builtin skill sibling files are synced and stale sibling files are pruned during projection refresh
- if assistant projection files change, Studio disposes the OpenCode instance for that execution directory so the updated agent/skills are used

## Act Contract Alignment

Assistant Act behavior should stay aligned with `doc/ACT_CONTRACT_GUIDE.md`.

Current assistant-specific rules:

- The assistant now sees `actRules` plus participant `subscriptions` in the stage snapshot.
- `createAct` and `updateAct` can set `actRules`.
- `updateParticipantSubscriptions` can mutate wake filters on an attached participant.
- Subscription updates use `callboardKeys` as the canonical field name.
- `subscriptions.eventTypes` currently only supports `runtime.idle`.
- Subscription source references should resolve to participants already attached to the target Act.

## Dance Bundle Authoring Alignment

- The assistant now supports Dance bundle sibling files through `upsertDanceBundleFile` and `deleteDanceBundleEntry`.
- `createDanceDraft` and `updateDanceDraft` remain the `SKILL.md` path only.
- Saved Dance drafts can be extended with `references/*`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.
- Unsaved markdown drafts are excluded from assistant stage context so the assistant does not target editor-local buffers with server-backed actions.

## Important Constraints

- The assistant is not a DOT asset.
- The assistant does not use performer projection.
- The assistant does not directly edit files through a special mutation API.
- Canvas mutation happens only through the action block protocol.
- The assistant can receive search hints for installed assets, registry assets, and `skills.sh`, but those hints are still prompt context, not direct tool calls.
- There is no server-side replay or transaction layer for assistant actions.
- Applied assistant actions are not automatically undoable as a single bundle.

## Failure Modes

### Partial apply

Some actions may apply while later ones fail.
Studio marks the message as applied to avoid accidental duplicate creation on rerender.
The assistant message shows the apply summary inline so the failure is visible in chat history.

### Ambiguous references

If the assistant uses a name that matches nothing, that action fails locally.
The current action applier now also treats missing participant keys and missing relation ids as failures instead of silently counting them as applied.

### Unknown identifiers

If Tal URNs, Dance URNs, model ids, or MCP names are guessed incorrectly, the action may fail or create incomplete setup.
The assistant should prefer `availableModels` from the stage snapshot instead of inventing model ids.

### Draft Dance removal

`removeDanceDraftIds` now resolves plain draft ids correctly when the assistant updates an existing Performer.
This avoids a previous bug where draft Dance removals could be reported as applied while the draft ref remained attached.

### Over-eager mutation

If a request could reasonably mean:

- create from scratch
- install and import an existing asset
- attach an already-installed asset

the assistant should ask first instead of silently picking one path.

## Guidance For Future Changes

1. Keep the assistant runtime-only.
2. Add new action types in `shared/assistant-actions.ts` first.
3. Update all three layers together:
   - assistant prompt guidance
   - protocol parsing/application
   - client documentation
4. Keep builtin assistant dances authored as Agent Skill directories, not ad-hoc markdown fragments.
5. Prefer explicit deterministic mutations over fuzzy natural-language interpretation.
6. Do not let assistant-specific behavior drift away from current store APIs.
