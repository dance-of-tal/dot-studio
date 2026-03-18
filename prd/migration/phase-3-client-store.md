# Phase 3 — Client Store & State (Frontend)

> Revised plan.
> Dedicated `Act Edit` focus mode를 제거하고,
> definition/runtime separation과 thread-scoped session identity를 store에 정착시키는 phase다.
> PRD §5, §10, §17 범위.

이 phase는 incremental cleanup이 아니라 **rewrite-first** 기준으로 진행한다.

---

## 목표

- `actSlice.ts`를 selection-based authoring model로 재구성
- standalone performer / act binding / thread participant session의 identity 분리
- act participant session key에 `threadId`를 포함시켜 thread 간 session 충돌 방지
- `mailbox / board` 모델을 `callboard` 중심 용어와 state shape으로 정리
- 좌측 메뉴가 definition navigation과 runtime navigation을 모두 지원하도록 selector 재구성

---

## 현재 코드 기준 문제

### 1. Focus mode 상태가 store를 과도하게 지배

현재 `editingActId`, `enterActEditFocus`, `exitActEditFocus`가 authoring 진입점이다.
새 방향에서는 Act 편집이 main canvas selection flow로 들어와야 하므로,
focus-mode 전용 상태는 핵심 상태가 아니어야 한다.

### 2. Act chat key가 thread scope를 반영하지 않음

현재:

```ts
const chatKey = `act:${actId}:${performerKey}`
```

이 구조는 같은 Act 안의 다른 thread가 서로 다른 performer sessions를 가져야 한다는 PRD와 충돌한다.

### 3. Binding 과 runtime participant 사이 구분이 약함

Act binding은 ref overlay인데, store가 thread start 시점의 runtime snapshot 정책을 더 분명히 가져야 한다.

---

## 삭제/축소 대상

### `src/store/actSlice.ts`

축소 또는 제거:

| 상태/액션 | 처리 방향 |
|----------|----------|
| `editingActId` | 제거 또는 `inspectedActId`로 축소 |
| `enterActEditFocus()` | 제거 |
| `exitActEditFocus()` | 제거 |
| focus snapshot 의존 로직 | 제거 |
| act-specific hidden/show state for focus mode | 제거 |

### `src/store/types.ts`

`ActSlice` 타입에서 focus-mode 중심 API를 제거하고,
selection + runtime navigation API로 교체한다.

---

## 새 store shape

### 핵심 selection 상태

```ts
interface ActSlice {
    // ── Definitions ─────────────────────────────
    acts: StageAct[]
    selectedActId: string | null
    selectedActParticipantKey: string | null
    selectedActRelationId: string | null

    // ── Runtime navigation ─────────────────────
    actThreads: Record<string, ActThreadState[]>
    selectedActThreadId: string | null
    selectedActThreadView: 'activity' | 'participant'
    selectedActThreadParticipantKey: string | null

    // ── CRUD / authoring ───────────────────────
    addAct: (name: string) => string
    removeAct: (id: string) => void
    renameAct: (id: string, name: string) => void
    updateActDescription: (id: string, description: string) => void
    updateActRules: (id: string, rules: string[]) => void
    selectAct: (id: string | null) => void

    bindPerformerToAct: (actId: string, performerRef: AssetRef) => string
    unbindPerformerFromAct: (actId: string, performerKey: string) => void
    updatePerformerBinding: (actId: string, performerKey: string, update: Partial<StageActPerformerBinding>) => void
    selectActParticipant: (key: string | null) => void

    addRelation: (actId: string, between: [string, string], direction: 'both' | 'one-way') => void
    removeRelation: (actId: string, relationId: string) => void
    updateRelation: (actId: string, relationId: string, update: Partial<ActRelation>) => void
    selectRelation: (id: string | null) => void

    // ── Thread runtime ─────────────────────────
    createThread: (actId: string) => Promise<string>
    selectThread: (threadId: string | null) => void
    selectThreadActivity: () => void
    selectThreadParticipant: (performerKey: string | null) => void
    loadThreads: (actId: string) => Promise<void>
}
```

### thread-scoped session identity

```ts
type ChatTargetKey =
    | `performer:${string}`
    | `act:${string}:thread:${string}:participant:${string}`
```

원칙:

- standalone performer session = `performer:${performerId}`
- act participant session = `act:${actId}:thread:${threadId}:participant:${performerKey}`
- 같은 `performerKey`라도 `threadId`가 다르면 다른 session이다

---

## Chat / Session 연동 변경

### `src/store/chatSlice.ts`

`sendActMessage()`는 다음을 만족해야 한다.

- 현재 선택된 `threadId`가 없으면 전송하지 않음
- chat key에 `threadId` 포함
- session lookup도 `threadId` 포함 key 기반
- thread start 시 participant sessions를 lazy-create 하거나 API가 돌려준 session map을 사용

예시:

```ts
const chatKey = `act:${actId}:thread:${threadId}:participant:${performerKey}`
```

### snapshot 정책

- thread 생성 시 `ActPerformerBinding`을 resolve해서 runtime payload를 만든다
- 실행 중 thread는 그 snapshot을 기준으로 계속 간다
- standalone performer 정의 변경은 새 thread에만 자동 반영한다

---

## Sidebar selector 변경

store는 아래 의미를 바로 뽑을 수 있어야 한다.

```ts
interface ActSidebarNode {
    actId: string
    label: string
    threads: Array<{
        threadId: string
        status: ActThreadState['status']
        inbox: { unreadCount?: number }
        participants: Array<{
            performerKey: string
            label: string
            sessionId: string | null
        }>
    }>
}
```

중요한 점:

- `Performers` 섹션은 definition tree
- `Acts` 섹션은 runtime tree
- 같은 이름이라도 경로가 다르면 다른 target이다

---

## 구현 단계

1. `sessionMap` key 규칙에 `threadId`를 추가한다
2. `sendActMessage`, `ActChatPanel`이 새 key 규칙을 사용하게 바꾼다
3. `editingActId`와 focus-mode 의존 상태를 제거한다
4. selection state를 `selectedActId / selectedActThreadId / selectedActThreadParticipantKey`로 재구성한다
5. sidebar selector를 definition/runtime separation에 맞춰 갱신한다

---

## 검증 기준

- [ ] standalone performer session과 act participant session이 섞이지 않는다
- [ ] 같은 Act의 서로 다른 thread가 서로 다른 participant sessions를 가진다
- [ ] thread가 선택되지 않은 상태에서는 act message 전송이 차단된다
- [ ] sidebar tree가 `Act -> Thread -> Inbox/Participant` 구조를 표시한다
- [ ] focus-mode 제거 후에도 act definition 편집이 가능하다
- [ ] `npm run build` 성공
