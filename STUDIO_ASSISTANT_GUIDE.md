# Studio Assistant Guide

## Purpose

Studio Assistant is a runtime-only chat target that helps mutate the Studio canvas.

It is not a persisted performer asset.
It does not publish to DOT.
It exists only as:

- a projected OpenCode agent
- a small set of builtin assistant skills
- a client-side action application protocol

## Identity

- performer id: `studio-assistant`
- UI entry: Stage toolbar assistant toggle
- state owner:
  - `src/store/assistantSlice.ts`

The assistant stores only runtime UI state:

- open/closed state
- selected model
- dedupe map for already-applied action messages

## File Map

- server projection:
  - `server/services/studio-assistant/assistant-service.ts`
- assistant Tal:
  - `server/services/studio-assistant/tal/studio-assistant.md`
- builtin assistant skills:
  - `server/services/studio-assistant/dances/*.md`
- client UI:
  - `src/features/assistant/AssistantChat.tsx`
- action protocol parsing:
  - `src/features/assistant/assistant-protocol.ts`
- action application:
  - `src/features/assistant/assistant-actions.ts`
- stage context contract:
  - `shared/assistant-actions.ts`

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
- builds an action prompt prefix from the current stage snapshot
- concatenates:
  - assistant context prefix
  - user message

Unlike performer projection:

- no performer Tal or Dance refs are compiled here
- no Act runtime tools are injected
- the assistant mutates the canvas through the action block protocol, not custom tools

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

If some or all actions fail, Studio now:

- shows a warning or error toast
- renders an inline apply summary under the assistant message

## Supported Actions

Defined in `shared/assistant-actions.ts`.

Current action types:

- `createTalDraft`
- `createDanceDraft`
- `createPerformer`
- `createPerformerBlueprint`
- `createAct`
- `createActBlueprint`
- `attachPerformerToAct`
- `connectPerformers`
- `setPerformerModel`
- `setPerformerTal`
- `addPerformerDance`
- `addPerformerMcp`

Resolution rules:

- prefer explicit ids from stage snapshot
- same-message refs can be used for newly created performers, acts, and drafts
- exact names are fallback only when ids are not known
- prefer blueprint actions when one request needs coordinated draft + performer + act creation

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
  - participant summaries
  - relation summaries
- drafts
  - id
  - kind
  - name
  - description
  - tags
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
.opencode/skills/dot-studio/studio-assistant-*/SKILL.md
```

Rules:

- builtin assistant skills come from `server/services/studio-assistant/dances/*.md`
- stale `studio-assistant-*` skill directories are removed during projection refresh
- if assistant projection files change, Studio disposes the OpenCode instance for that execution directory so the updated agent/skills are used

## Important Constraints

- The assistant is not a DOT asset.
- The assistant does not use performer projection.
- The assistant does not directly edit files through a special mutation API.
- Canvas mutation happens only through the action block protocol.
- There is no server-side replay or transaction layer for assistant actions.
- Applied assistant actions are not automatically undoable as a single bundle.

## Failure Modes

### Partial apply

Some actions may apply while later ones fail.
Studio marks the message as applied to avoid accidental duplicate creation on rerender.
The assistant message shows the apply summary inline so the failure is visible in chat history.

### Ambiguous references

If the assistant uses a name that matches nothing, that action fails locally.

### Unknown identifiers

If Tal URNs, Dance URNs, model ids, or MCP names are guessed incorrectly, the action may fail or create incomplete setup.
The assistant should prefer `availableModels` from the stage snapshot instead of inventing model ids.

## Guidance For Future Changes

1. Keep the assistant runtime-only.
2. Add new action types in `shared/assistant-actions.ts` first.
3. Update all three layers together:
   - assistant prompt guidance
   - protocol parsing/application
   - client documentation
4. Prefer explicit deterministic mutations over fuzzy natural-language interpretation.
5. Do not let assistant-specific behavior drift away from current store APIs.
