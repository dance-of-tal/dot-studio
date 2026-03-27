# ACT_STUDIO_IMPLEMENTATION — Current Status & Gap Analysis

> This document tracks the implementation status of Act runtime features in Studio.
> Referenced by [ACT_CONTRACT_GUIDE.md](./ACT_CONTRACT_GUIDE.md).

## Implementation Status

### ✅ Fully Implemented

| Feature | File(s) |
|---|---|
| Canonical import boundary | `src/store/act-slice-helpers.ts` — `importActFromAssetImpl()` |
| Draft save boundary | `src/store/workspace-draft-actions.ts` — `saveActAsDraftImpl()` |
| Publish/canonical boundary | `src/lib/performers-publish.ts` — `buildActAssetPayload()` |
| Runtime definition boundary (4-layer) | `buildServerActDefinition()` → `ActDefinition` |
| Thread persistence | `server/services/act-runtime/thread-manager.ts` |
| Event routing | `server/services/act-runtime/event-router.ts` |
| Wake prompt generation | `server/services/act-runtime/wake-prompt-builder.ts` |
| Session queue (same-participant policy) | `server/services/act-runtime/session-queue.ts` |
| Safety guards | `server/services/act-runtime/safety-guard.ts` |
| Act readiness evaluation | `src/features/act/act-readiness.ts` |
| Manual Act chat (sendActMessage) | `src/store/chat/chat-send-actions.ts` + `server/services/chat-service.ts` |
| Lazy session resolve | `src/store/integration-streaming.ts` + `server/routes/chat-messages.ts` (`/api/chat/sessions/:id/resolve`) |

### ✅ Recently Fixed

| Feature | Issue | Fix |
|---|---|---|
| Session resolve ownerId | Returned `actId` instead of full chatKey | `chat-service.ts` now stores full `performerId` as `ownerId` |
| Wake cascade performer projection | No TAL/Dance/MCP/model | New `wake-performer-resolver.ts` + `ensurePerformerProjection` |
| Collaboration tool rewrite | Model-facing tool names and args exposed Studio jargon and low-signal IDs | Rewritten as `message_teammate`, `update_shared_board`, `read_shared_board`, `wait_until` with session-bound runtime resolution |
| Stable collaboration context placement | Stable team/rule/tool context was injected into turn prompts | Stable collaboration context now compiles into the agent/system prompt via performer projection |
| Wake/manual consistency | Wake prompts and manual chat used different collaboration context strategies | Manual chat now sends only user text; wake prompts now send only transient updates, with fallback-only context injection when performer projection is unavailable |
| Queue drain | Queued wake-ups ignored | `markIdle` return value now drives recursive drain |
| activeThreadId after loadThreads | Validated against stale state | Now checks `result.threads` |
| Thread delete cleanup | Orphaned sessions/chats | `deleteThread` cleans `sessionMap` + `chats` |
| runtime.idle emission | Event type defined but never emitted | `maybeEmitRuntimeIdle` in `ActRuntimeService` |
| Readiness validation | Gaps in relation/subscription checks | Additional readiness and server-side validation for relation metadata and subscription source checks |
| Board durability restore | API could load stale mailbox board from `thread.json` instead of `board.json` | `loadPersistedThreads()` now restores board from `board.json` and v2 snapshots stop persisting mailbox board |
| Live runtime sync | Existing threads were frozen to creation-time runtime snapshot | New act runtime-definition sync endpoint updates active/idle threads in place |

### ⚠️ Known Gaps

| Gap | Severity | Notes |
|---|---|---|
| Execution mode policy | Low | Wake cascade now reads `executionMode` from workspace, but no explicit policy doc for why Act defaults differ from performer chat |
| Auto-scroll on sync | Low | `ActChatPanel` auto-scrolls on message count change; may need refinement for streaming updates |
| Wake cascade integration coverage | Medium | Unit coverage now covers rewritten collaboration context and session-bound tool generation, but end-to-end wake/drain integration coverage is still thin |
| Retired participant session UX | Medium | Runtime now preserves retired participant sessions for rebind safety, but Studio UI does not yet surface archived participant histories |

## Architecture Reference

```
┌──────────────────────────────────────────────────────┐
│                    Studio Frontend                    │
│  actSlice → createThread / syncDefinition → loadThreads │
│  ActChatPanel → ThreadBody → auto-scroll on sync    │
│  integration-streaming → tryLazyResolveSession      │
└────────────────────────┬─────────────────────────────┘
                         │ API
┌────────────────────────▼─────────────────────────────┐
│                   Studio Server                       │
│  chat-service → ensurePerformerProjection + collaboration tools │
│  act-runtime-service → processWakeCascade + syncActDefinition │
│  wake-cascade → resolvePerformerForWake → projection │
│  act-tool-projection → stable collaboration context + session-bound tools │
│  thread-manager → persist thread metadata / board / events │
│  session-queue → same-participant policy + drain     │
└──────────────────────────────────────────────────────┘
```
