# Phase 2 — BFF & Event Routing (Server)

> BFF를 orchestration brain에서 event router로 전환한다.
> Act runtime tools를 구현하고, subscription + relation 기반 wake-up routing을 구축한다.
> PRD §7, §8, §9, §13, §14, §15, §16 범위.

---

## 목표

- Act runtime tools (send_message, post_to_board, read_board, set_wake_condition) 구현
- Relation/permission 검증 로직
- Subscription + WakeCondition 기반 event routing
- Wake-up prompt 생성 및 performer session 주입
- Session queue 관리 (Same Performer Policy)
- Safety guard (event budget, loop detection, timeout, idle detection)
- Act context injection (PRD §9)

---

## 삭제 대상

### `server/services/opencode-projection/relation-compiler.ts`

- 전체 삭제 — relation → custom tool file 생성 방식 제거
- 대신 runtime tools가 Act context에 주입됨

### `server/routes/chat.ts` 내 Act 관련 delegation 로직

- `actRelations`/`relatedPerformers` 파라미터 처리 제거
- Act Thread 기반 session routing으로 대체

### `server/services/chat-service.ts` 내 Act delegation 처리

- performer 간 직접 session 생성/호출 로직 제거

---

## 새로 작성할 모듈

### `server/services/act-runtime/act-tools.ts` [NEW]

Performer에게 노출되는 Act runtime tools:

```ts
// send_message — fire-and-forget
interface SendMessageParams {
    to: string
    content: string
    tag?: string
}

// post_to_board
interface PostToBoardParams {
    key: string
    kind: 'artifact' | 'fact' | 'task'
    content: string
    updateMode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

// read_board
interface ReadBoardParams {
    key?: string
    latestOnly?: boolean
    limit?: number
}

// set_wake_condition
interface SetWakeConditionParams {
    target: 'self'
    onSatisfiedMessage: string
    condition: ConditionExpr
}
```

이 tool들은 performer의 OpenCode session에 custom tool로 주입된다.
Tool 호출 시 BFF가 처리:

1. relation/permission 검증
2. mailbox 상태 변경
3. event 생성 및 log 기록
4. routing 판단 및 wake-up

### `server/services/act-runtime/event-router.ts` [NEW]

PRD §15.2 routing logic:

```ts
function routeEvent(
    event: MailboxEvent,
    actDefinition: ActDefinition,
    mailbox: Mailbox
): WakeUpTarget[] {
    // 1. Subscription + relation 기반
    const subTargets = actDefinition.performers
        .filter(p => matchSubscription(p, event) && matchRelationPermission(p, event))

    // 2. WakeCondition 기반
    const condTargets = mailbox.evaluateConditions(event)

    return deduplicate([...subTargets, ...condTargets])
}

interface WakeUpTarget {
    performerKey: string
    triggerEvent: MailboxEvent
    wakeCondition?: WakeCondition  // condition-triggered인 경우
}
```

### `server/services/act-runtime/wake-prompt-builder.ts` [NEW]

PRD §15.3 wake-up prompt 생성:

```ts
// BFF는 "무엇을 하라"가 아니라 "무슨 일이 일어났는지"만 전달
function buildWakePrompt(target: WakeUpTarget, mailbox: Mailbox): string {
    // event type에 따른 요약 생성
    // - message.sent → "[메시지 알림] {from}이 메시지를 보냈습니다. tag: {tag}"
    // - board.posted/updated → "[Board 알림] {author}가 key={key} 항목을 게시했습니다."
    // - WakeCondition triggered → onSatisfiedMessage 전달
    //
    // + pending messages 첨부 (delivered 후 삭제)
    // + "Tal과 active dances에 따라 필요한 행동을 판단하라" 지시
}
```

### `server/services/act-runtime/act-context-builder.ts` [NEW]

PRD §9 Act context injection:

```ts
function buildActContext(
    actDefinition: ActDefinition,
    performerKey: string,
    mailbox: Mailbox
): string {
    // 마크다운 형태의 Act context 생성:
    // - 목표, 참여자 목록
    // - Collaboration Runtime 설명
    // - Available Relations (이 performer의 relation 파트너)
    // - 이 performer의 Subscriptions
    // - Active Dances
    // - Act Rules
}
```

### `server/services/act-runtime/session-queue.ts` [NEW]

PRD §15.4 Same Performer Policy:

```ts
class SessionQueue {
    // 동일 performer가 실행 중이면 queue에 적재
    enqueue(performerKey: string, wakeUp: WakeUpTarget): void
    dequeue(performerKey: string): WakeUpTarget | null
    isRunning(performerKey: string): boolean

    // Coalescing rules:
    // - 동일 board key update → latest-only
    // - 동일 sender 연속 message → batch
    // - 서로 다른 tag → merge하지 않음
}
```

### `server/services/act-runtime/safety-guard.ts` [NEW]

PRD §16 Safety & Guard:

```ts
interface SafetyConfig {
    maxEventsPerAct: number
    maxMessagesPerPair: number
    maxBoardUpdatesPerKey: number
    quietWindowMs: number
    loopDetectionThreshold: number
    threadTimeoutMs: number
}

class SafetyGuard {
    checkEventBudget(event: MailboxEvent): boolean
    checkLoopDetection(from: string, to: string, tag?: string): boolean
    checkTimeout(thread: ActThread): boolean
    checkIdleCondition(mailbox: Mailbox, queue: SessionQueue): boolean
    checkPermission(from: string, to: string, relations: ActRelation[]): boolean
    checkBoardWritePolicy(entry: BoardEntry, author: string): boolean
}
```

### `server/services/act-runtime/act-tool-projection.ts` [NEW]

Act tool을 performer session에 주입하는 projection:

```ts
// 기존 act-compiler.ts의 relation→custom tool 방식 대체
// Act 참여 performer에게 공통 Act runtime tools 주입:
//   - send_message
//   - post_to_board
//   - read_board
//   - set_wake_condition

function projectActTools(
    performerKey: string,
    actDefinition: ActDefinition,
    threadId: string,
    executionDir: string
): ActToolProjection {
    // 1. Act context prompt 생성 (act-context-builder)
    // 2. runtime tool definitions 생성
    // 3. tool handler endpoint 매핑 (BFF route)
}
```

---

## BFF Route 변경

### `server/routes/chat.ts` 수정

```diff
- actRelations 파라미터 처리
- relatedPerformers 파라미터 처리
+ actThreadId 파라미터 처리
+ Act Thread 내 session prompt 시 act context injection
+ wake-up prompt 주입 경로 추가
```

### `server/routes/act-runtime.ts` [NEW]

Act runtime tool 호출 endpoint:

```ts
// POST /api/act/:actId/thread/:threadId/send-message
// POST /api/act/:actId/thread/:threadId/post-to-board
// GET  /api/act/:actId/thread/:threadId/read-board
// POST /api/act/:actId/thread/:threadId/set-wake-condition
// GET  /api/act/:actId/thread/:threadId/events  (SSE or tail)
```

---

## 검증 기준

- [ ] send_message → event 생성 → subscription 매칭 → wake-up prompt 주입 end-to-end
- [ ] post_to_board → board 저장 → subscriber wake-up 확인
- [ ] set_wake_condition → all_of 조건 설정 → 조건 충족 시 wake-up 확인
- [ ] relation 없는 performer에 send_message 시 거부 확인
- [ ] Same Performer Policy (queue, coalesce) 동작 확인
- [ ] Safety guard: event budget 초과 시 차단, loop detection 동작
- [ ] Act context prompt에 목표/참여자/relation/subscription/dances/rules 포함 확인
