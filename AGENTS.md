# AGENTS.md

## Purpose

`studio` is the local visual editor for Dance of Tal, built on top of OpenCode.

Think about the codebase in this order:

1. `src/` renders and edits Studio state in the browser
2. `shared/` defines contracts shared by client and server
3. `server/` turns Studio state into runtime actions, projections, and API responses
4. `.opencode/` holds projected/generated OpenCode-facing artifacts
5. OpenCode executes the resulting runtime outside the React app
6. If you need opencode codebase, find resoure at here : /Users/junhoyoon/tmp/opencode-source/opencode

## Top-Level Structure

- `src/`
  - Frontend application
  - Main UI, canvas, panels, assistant chat, performer chat, Act UI, Zustand store
  - Treat this as the Studio interaction layer
- `shared/`
  - Shared contracts and runtime-safe types
  - Keep client/server protocol shapes here
  - Do not put browser-only or server-only behavior here
- `server/routes/`
  - HTTP boundary
  - Thin route layer that validates/forwards requests into services
- `server/services/`
  - Main backend behavior
  - Studio workspace operations, chat/session orchestration, asset/draft handling, export, runtime prep
- `server/services/opencode-projection/`
  - Projection boundary from Studio concepts into OpenCode-consumable agent artifacts
  - If a change affects performer compilation, skill bundling, projection manifests, or preview output, start here
- `server/services/act-runtime/`
  - Act runtime scheduling, wake-up flow, mailbox/event routing, runtime collaboration behavior
- `server/services/studio-assistant/`
  - Runtime-only Studio Assistant projection and prompt/action layer
- `.opencode/`
  - Generated/projected OpenCode workspace data and manifests
  - Useful for debugging projection output
  - Do not treat this as the main source of truth unless the task is explicitly about projection artifacts
- `doc/`
  - Detailed architectural and behavioral guides
  - Read the relevant docs before making non-trivial runtime/session/assistant changes
- `public/`
  - Static assets served by the app
- `client/`, `dist/`
  - Build outputs
  - Prefer changing source files, not generated output

## Frontend To OpenCode Boundary

- Browser/UI work starts in `src/App.tsx`, feature modules under `src/features/`, reusable UI under `src/components/`, and state in `src/store/`
- Frontend talks to the backend through `src/api-clients/` and shared API helpers
- Backend entry is `server/app.ts` plus `server/routes/*`
- Real behavior lives in `server/services/*`
- Projection/runtime preparation happens in backend services, especially `server/services/opencode-projection/*` and runtime-prep/session services
- The result is materialized into `.opencode/agents/dot-studio/...` and related manifest files
- OpenCode then runs against those projected artifacts

In short:

`src` -> `src/api-clients` -> `server/routes` -> `server/services` -> `.opencode` projection/output -> OpenCode runtime

## Working Rules

- Keep the responsibility boundary clear:
  - UI/state shaping in `src/`
  - shared contracts in `shared/`
  - runtime, projection, and persistence orchestration in `server/`
- Do not bypass the normal path from frontend to backend to runtime
- Do not hand-edit generated output in `client/`, `dist/`, or projection artifacts in `.opencode/` unless the task is specifically about generation output/debugging
- When a change affects sessions, assistant behavior, Act runtime, projection policy, or runtime reload behavior, check `doc/` first

## Frontend Design System Rules

- `src/tokens.css` is the single source of truth for shared color, spacing, radius, shadow, and typography tokens
- `src/primitives.css` owns reusable UI primitives such as buttons, inputs, pills, surface cards, and shared navigation treatments
- if two UI elements have the same job, they should use the same primitive and the same visual treatment
  - navigation choices should reuse the same pill-style navigation language
  - card-like content containers should reuse the same surface card language
  - grouped settings/list rows should reuse the same border, spacing, and section rhythm
- do not introduce ad hoc token names inside feature CSS when an existing token or alias should be extended centrally in `tokens.css`
- do not restyle the same interaction pattern independently in each feature without a clear product reason
- prefer thin borders, compact spacing, soft surface contrast, and restrained accents so the UI stays clean and consistent with Studio
- when adding new frontend UI, check `tokens.css` and `primitives.css` first before inventing local classes

## Documentation Rule

If you need detailed behavior, invariants, or change policy, read the documents in `doc/`.

Important starting points:

- `doc/CHAT_SESSION_RUNTIME_GUIDE.md`
- `doc/RUNTIME_CHANGE_BOUNDARY_GUIDE.md`
- `doc/STUDIO_ASSISTANT_GUIDE.md`
- `doc/ACT_CONTRACT_GUIDE.md`
- `doc/publish_rule.md`

## Update Rule

If code changes alter behavior, boundaries, contracts, runtime flow, or operator expectations, update the relevant document in `doc/` in the same change.

Do not leave code and docs out of sync.

## Design System Rule

- 같은 기능을 하는 UI는 같은 디자인/primitive를 쓴다. (예: 리스트 행, 패널, 모달, 버튼, 알림 메시지 등)
- 새로운 컴포넌트를 스타일링할 때는 먼저 `src/tokens.css`의 토큰(색상, 테두리, 간격 등)과 `src/primitives.css`의 공용 클래스(.alert, .surface-card, .list-row 등)를 확인한다.
- 로컬 CSS 파일에서 임의의 색상이나 단위 하드코딩을 피하고 가급적 토큰을 사용하며, 공용 패턴은 `src/primitives.css`로 승격시킨다.
