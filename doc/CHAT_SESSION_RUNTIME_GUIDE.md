# Chat Session Runtime Guide

## Purpose

This document defines the current chat session architecture used by DOT Studio.

The goal of the refactor was to make performer chat, Act participant chat, and Studio Assistant chat use the same session runtime.

Do not reintroduce legacy dual-write behavior.
Do not add new code that depends on old flat chat/session fields.
Workspace persistence is v1-only: prefer a single current snapshot shape over version-by-version compatibility branches.

## Source of Truth

The canonical client-side session runtime lives in:

- `src/store/session/*`

The canonical chat target identity helpers live in:

- `shared/chat-targets.ts`

The canonical server-side ownership wrapper lives in:

- `server/services/session-ownership-service.ts`

## Canonical State Model

Session state is owned by the normalized session slice, not by `chatSlice`.

Primary state tables:

- `chatKeyToSession`
- `sessionToChatKey`
- `seEntities`
- `seMessages`
- `seStatuses`
- `sePermissions`
- `seQuestions`
- `seTodos`
- `sessionLoading`
- `sessionReverts`
- `chatDrafts`
- `chatPrefixes`

Meaning:

- `chatKeyToSession` is the canonical binding index for UI chat targets
- `sessionToChatKey` is the reverse lookup for SSE routing and restore
- chat/session bindings are one-to-one; rebinding must remove stale forward and reverse entries in the same mutation
- `chatDrafts` holds visible local messages for unbound chats
- `chatPrefixes` holds persistent local system notices and reset/system prefix messages
- all permission, question, todo, loading, and revert state is owned by session state

## Chat Targets

All three chat surfaces use the same runtime shape:

1. Performer chat
   - chat key: performer id
2. Act participant chat
   - chat key: `act:{actId}:thread:{threadId}:participant:{participantKey}`
3. Studio Assistant chat
   - chat key built from `buildAssistantChatKey(...)`

Use helpers from `shared/chat-targets.ts`.
Do not duplicate chat key parsing or regex logic in UI/store files.

## Command Boundary

All session mutations should go through `src/store/session/session-commands.ts`.

Current command surface:

- `registerSessionBinding`
- `bindExistingSession`
- `createFreshSessionBinding`
- `ensureSession`
- `syncSessionSnapshot`
- `detachChatSession`
- `clearChatSessionView`
- `appendLocalMessage`
- `appendSystemNotice`
- `moveDraftMessageToSession`
- `resolveChatKeySession`

Rule:

- if a change needs `api.chat.messages`, binding updates, or session snapshot reconciliation, it belongs in session commands
- explicit “new session” UX must create a fresh OpenCode session through `createFreshSessionBinding`
- do not fake a new thread by clearing local messages while keeping the old backend session bound

## Query Boundary

Read session state through:

- selectors in `src/store/session/session-selectors.ts`
- `useChatSession` in `src/store/session/use-chat-session.ts`

`useChatSession` is the preferred UI entry point for:

- `messages`
- `sessionId`
- `isLoading`
- `status`
- `permission`
- `question`
- `todos`
- `revert`
- `prefixCount`

Important:

- import `useChatSession` from `src/store/session/use-chat-session`
- do not import it from `src/store/session/index.ts`
- this avoids barrel-cycle and runtime export issues

## UI Rules

UI components should not:

- call `api.chat.messages(...)` directly
- mutate `chatKeyToSession` or session maps via raw `setState`
- maintain parallel permission/question/todo state
- clear sessions by writing sentinel values like empty string ids

UI components should:

- read session data through selectors or `useChatSession`
- clear todos with `setSessionTodos(sessionId, [])`
- bind or restore sessions through session commands
- keep the current binding when merely opening/focusing a chat surface; only explicit new-session or detach actions should replace it

## Legacy Fields That Must Stay Dead

Do not add new runtime logic that depends on:

- `sessionMap`
- `chats`
- `loadingPerformerId`
- `pendingPermissions`
- `pendingQuestions`
- `todos`
- `historyCursors`

If one of these appears in a new patch, treat it as a regression unless it is only in a migration note or historical comment.

## Realtime Boundary

Realtime transport belongs in:

- `src/store/integrationSlice.ts`

Realtime event reduction belongs in:

- `src/store/session/event-ingest.ts`
- `src/store/session/event-reducer.ts`

Rule:

- `integrationSlice` manages connection lifecycle and incoming transport
- session event files manage how session state changes in response to events
- idle/compaction resync should go back through session commands
- coalesced streaming text must never drop accumulated `message.part.delta` content when non-delta events arrive in the same flush window
- session snapshot reconciliation must not regress in-flight assistant/system message content while the session is still busy or retrying
- when OpenCode no longer reports a session status, Studio should treat a completed assistant snapshot as authoritative settlement and collapse the local optimistic loading bridge instead of waiting indefinitely for an explicit idle event
- optimistic user mirrors and streamed assistant content should be reconciled in session commands, not patched ad hoc in UI components

## Runtime Guard Rules

When Studio prepares runtime changes before a send:

- projection-change blocking only applies when the target actually requires a projection refresh or runtime dispose
- if no dispose is required, unrelated concurrent sessions should not be blocked
- when a dispose is required, conflict checks must treat the OpenCode instance as working-dir scoped:
  - any busy session in the same working directory should block the dispose
  - do not narrow dispose safety checks to only the performer or only the Act participant
  - otherwise a new projection can dispose the shared runtime and abort unrelated in-flight participant runs
- workspace-wide runtime reloads may still block all new chats until the reload is applied
- projection materialization and runtime adoption are separate:
  - projection files may be written ahead of time during preview or Act prewarm
  - a separate pending-adoption marker should remember that the runtime still needs one execution-boundary dispose
  - do not assume `changed === false` means no dispose is needed if a pending-adoption marker still exists

## Act Wake Scheduling

Act wake-up queuing is participant-scoped, not thread-scoped.

- if participant `A` is already running, new wakes for `A` should queue
- wakes for participant `B` should still be allowed to start while `A` is running
- if a wake needs a projection-adoption dispose but another working-dir session is still busy, defer that wake and retry after the working directory goes idle
- do not drop a wake-up target just because runtime preparation is temporarily blocked
- do not reintroduce thread-wide serialization for all participants in a thread unless the product behavior explicitly changes
- queue state is runtime-only scheduling metadata; it should not leak into participant-facing wake text by default
- wake prompt rendering should focus on the trigger and the delivered collaboration content, not mailbox status labels like `pending`
- mailbox direct messages should only be marked delivered after the wake prompt is successfully injected into the session
- `runtime.idle` is a system follow-up trigger, not a participant-facing mailbox status or prompt hint
- the idle-triggered follow-up cascade is intentionally non-recursive: routing `runtime.idle` should not emit another `runtime.idle` from that same follow-up pass

## Auto-Scroll Boundary

- shared thread auto-scroll should stop following as soon as the user scrolls up through normal chat content during streaming
- only genuinely independently scrollable descendants should be treated as nested `data-scrollable` boundaries
- do not mark every message wrapper as a nested scroll boundary unless that wrapper actually scrolls on its own

## Server Boundary

Session ownership metadata should be accessed through:

- `server/services/session-ownership-service.ts`

Do not spread `session-execution` file access logic across routes and services.

Current server callers that should stay on the ownership service boundary:

- `server/services/chat-service.ts`
- `server/services/chat-session-service.ts`
- `server/services/chat-event-stream-service.ts`
- `server/routes/chat-messages.ts`
- `server/routes/act-runtime-tools.ts`
- `server/services/workspace-service.ts`

## Server Logging Defaults

- default Hono/server terminal logging should stay quiet for successful fast requests
- log request lines for `4xx`, `5xx`, and slow requests so operator-facing problems still surface in the terminal
- Act runtime success-path diagnostics should stay behind `STUDIO_VERBOSE_SERVER_LOGS=1` instead of printing on every wake, projection, or tool call
- warnings and errors that indicate degraded runtime behavior should continue to print by default

## Quick Checklist For Future Changes

- Is the change using canonical `chatKey` identity?
- Is session mutation going through session commands?
- Is UI reading from `useChatSession` or session selectors?
- Is the change avoiding legacy chat/session fields?
- Is server ownership logic going through `session-ownership-service.ts`?

If the answer to any of these is no, stop and simplify before adding more code.
