# Studio Handoff

## Snapshot

- Workspace: `/Users/junhoyoon/windsurfpjt/dance-of-tal/studio`
- Current commit: `cfb6894`
- Branch: `main`
- Verification baseline:
  - `studio`: `npm run build` passes
  - `dot`: `npm run build` and `npm test` passed earlier after participant-first schema rewrite
- Related DOT workspace:
  - `/Users/junhoyoon/windsurfpjt/dance-of-tal/dot`

## Read First

### Must Read

- [PRD-003](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/prd/003-choreography-act.md)
- [README.dev.md](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/README.dev.md)
- [AGENT_HANDOFF.md](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/AGENT_HANDOFF.md)

### Recommended

- [realignment-overview.md](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/prd/migration/realignment-overview.md)
- [phase-3-client-store.md](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/prd/migration/phase-3-client-store.md)
- [phase-4-ui-components.md](/Users/junhoyoon/windsurfpjt/dance-of-tal/studio/prd/migration/phase-4-ui-components.md)
- DOT schema/code at `/Users/junhoyoon/windsurfpjt/dance-of-tal/dot`

## Product Direction

Current direction is:

- `Act = compact boundary`
- `selected Act = richer surface`
- `advanced layout = optional isolated path`
- `performer` stays as standalone asset/runtime unit
- `participant` is the Act-internal binding/role
- `callboard` is the user-facing shared runtime surface
- current-only model; no legacy migration compatibility required

## What Has Been Rewritten

### Client architecture

- Large UI files were split into shell + sections/subcomponents/hooks.
- `CanvasArea` now behaves like a shell over helpers/hooks/components.
- `Act` UI is split into:
  - `ActBoundarySummary`
  - `ActSurfacePanel`
  - `ActLayoutToolbar`
  - `ActInspectorPanel` shell + `ActMetaView` / `ActParticipantBindingView` / `ActRelationView`
- `StageExplorer` is split into:
  - `StageExplorer` shell
  - `StageExplorerStagesSection`
  - `StageExplorerThreadsSection`
  - `StageExplorerPerformerGroup`
  - `StageExplorerActGroup`
- `AssetLibrary` is split into:
  - `AssetLibrary` shell
  - `AssetLibraryLocalView`
  - `AssetLibraryRegistryView`
  - `AssetLibraryMcpManager`
  - `AssetLibraryModelList`
  - `AssetCards` shell
  - `AssetPopover`
  - `AssetDetailBody`
- `PublishModal` is split into:
  - `PublishModal` shell
  - `PublishPickerStep`
  - `PublishFormStep`
  - `usePublishModalController`
- `SettingsModal` is split into:
  - `SettingsModal` shell
  - `SettingsGeneral`
  - `SettingsProviders`
  - `SettingsModels`
  - `SettingsOpenCode`
  - `SettingsProject`
- Performer UI is split further:
  - `AgentFrame` shell
  - `PerformerFrameHeaderMeta`
  - `usePerformerSafeReview`
  - `PerformerChatPanel` shell
  - `PerformerThreadView`
  - `PerformerChatComposer`
  - `usePerformerChatComposerState`
  - `PerformerEditPanel` shell
  - `performer-edit-sections`

### Store architecture

- `workspaceSlice` has been trimmed by moving logic into:
  - `workspace-stage`
  - `workspace-performer-config`
  - `workspace-draft-actions`
  - `workspace-focus-actions`
- `actSlice` has been trimmed by moving logic into:
  - `act-slice-helpers`
  - `act-slice-actions`
- `chatSlice` is now a shell over:
  - `chat/chat-internals`
  - `chat/chat-approvals`
  - `chat/chat-session-actions`
  - `chat/chat-send-actions`
  - `chat/chat-session-management`
- realtime integration handlers are split into:
  - `integration-event-handlers` shell
  - `integration-message-handlers`
  - `integration-session-handlers`

### API client architecture

- `src/api.ts` is now a shell over:
  - `src/api-core.ts`
  - `src/api-clients/chat.ts`
  - `src/api-clients/dot.ts`
  - `src/api-clients/opencode.ts`
  - `src/api-clients/workspace.ts`

### Server architecture

- Server routes were rewritten into thin adapters.
- `server/index.ts` + `server/app.ts` now follow:
  - entry -> app -> routes -> services
- Large routes were split into domain subrouters:
  - `chat-*`
  - `opencode-*`
  - `dot-*`
  - `act-runtime-*`
  - `drafts-*`
  - `safe-*`
- Route helpers now centralize:
  - working dir extraction
  - service error responses

### Schema / naming direction

- Participant-first Act schema is in place.
- `shared/draft-contracts.ts` and `shared/act-types.ts` use participant/callboard language.
- Studio UI and DOT schema were aligned to:
  - `participants`
  - `relations`
  - `callboardKeys`
- `dot` Act schema was rewritten accordingly.

## Important Commits

- `7b72b35` `refactor act toward selection-based callboard runtime`
- `0d0306f` `rewrite act canvas into boundary surface architecture`
- `9dc5c69` `refactor server routes into service adapters`
- `8605a7e` `align studio and dot to participant-first act model`
- `cfb6894` `refactor studio into modular participant-first client shells`

## Current Uncommitted Work

These changes exist after `cfb6894` and are not committed yet:

- Modified:
  - `src/components/modals/PublishModal.tsx`
  - `src/features/performer/AgentFrame.tsx`
  - `src/features/performer/PerformerChatPanel.tsx`
  - `src/features/performer/PerformerEditPanel.tsx`
  - `src/store/actSlice.ts`
  - `src/store/chat/chat-session-actions.ts`
- New:
  - `src/components/modals/usePublishModalController.ts`
  - `src/features/performer/PerformerFrameHeaderMeta.tsx`
  - `src/features/performer/PerformerThreadView.tsx`
  - `src/features/performer/performer-edit-sections.tsx`
  - `src/features/performer/usePerformerChatComposerState.ts`
  - `src/features/performer/usePerformerSafeReview.ts`
  - `src/store/act-slice-actions.ts`
  - `src/store/chat/chat-send-actions.ts`
  - `src/store/chat/chat-session-management.ts`

These changes were build-verified after editing.

## Biggest Remaining Files

Current largest TS/TSX files worth targeting next:

- `src/features/performer/PerformerChatComposer.tsx`
- `src/store/workspaceSlice.ts`
- `src/components/panels/AssetLibrary.tsx`
- `src/App.tsx`
- `src/components/terminal/TerminalPanel.tsx`
- `src/store/actSlice.ts`
- `src/components/panels/asset-library-utils.ts`
- `src/lib/performers.ts`
- `src/lib/performers-publish.ts`

Large CSS files also remain:

- `src/components/panels/AssetLibrary.css`
- `src/components/modals/SettingsModal.css`
- `src/index.css`
- `src/features/performer/AgentChat.css`
- `src/components/panels/StageExplorer.css`
- `src/features/act/ActInspectorPanel.css`

## Recommended Next Steps

### 1. Finish shell decomposition

Suggested order:

1. `PerformerChatComposer.tsx`
2. `AssetLibrary.tsx`
3. `App.tsx`
4. `TerminalPanel.tsx`
5. `asset-library-utils.ts`
6. `performers.ts` / `performers-publish.ts`

### 2. Add tests

Currently most verification is `npm run build`.

Highest-value tests:

- act helper tests:
  - `act-slice-helpers`
  - `act-slice-actions`
- workspace helper tests:
  - `workspace-draft-actions`
  - `workspace-focus-actions`
- chat helper tests:
  - `chat-send-actions`
  - `chat-session-management`
- modal/controller tests:
  - `usePublishModalController`

### 3. CSS decomposition

TS/TSX structure is now mostly modular.
The next cleanup wave can split CSS by feature sections the same way.

### 4. Optional further bundle work

Current client build no longer has >500k warning, but vendor chunks are still large:

- `markdown-vendor`
- `terminal-vendor`
- `index.es`

This is acceptable for now, but can be optimized later if needed.

## Verification Commands

### Studio

```bash
cd /Users/junhoyoon/windsurfpjt/dance-of-tal/studio
npm run build
```

### DOT

```bash
cd /Users/junhoyoon/windsurfpjt/dance-of-tal/dot
npm run build
npm test
```

## Notes For The Next Agent

- Prefer current-only cleanup over compatibility layers.
- Do not reintroduce `performers` as the Act collection name; keep `participants`.
- `performer` still remains the standalone asset/runtime concept.
- `participant` is the Act-internal binding concept.
- `callboard` is the user-facing runtime surface; internal `mailbox` naming may still exist in server runtime internals.
- The user has been asking to "keep going" without pausing, so default to continuing refactors and only stop for real blockers.
