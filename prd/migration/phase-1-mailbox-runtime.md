# Phase 1 — Mailbox & Act Runtime (Server)

> Mailbox (Messages + Board + Events)와 Act Thread 런타임을 서버에 구현한다.
> PRD §5–§6, §14–§15 범위.

---

## 목표

- Act Thread lifecycle 관리 (생성, 상태 전환, shutdown)
- Mailbox 구현 (pending messages, board, event log)
- WakeCondition 평가 엔진
- Durability policy 적용 (board/event durable, message/condition ephemeral)

---

## 삭제 대상

### `server/services/opencode-projection/act-compiler.ts`

- 전체 삭제 — orchestration 기반 relation→custom tool 컴파일 방식은 제거
- 새 projection은 mailbox tool injection 방식으로 대체 (Phase 2에서 구현)

### `server/services/delegate-service.ts`

- 전체 삭제 — 직접 delegation 호출 방식 제거
- performer 간 통신은 mailbox `send_message`로 대체

### `server/routes/delegate.ts`

- 전체 삭제 — delegation API endpoint 제거

---

## 새로 작성할 모듈

### `server/services/act-runtime/mailbox.ts` [NEW]

Mailbox 상태 관리:

```ts
class Mailbox {
    // pending messages (in-memory, transient)
    private pendingMessages: MailboxMessage[] = []

    // board (file-backed + memory cache, durable)
    private board: Map<string, BoardEntry> = new Map()

    // wake conditions (in-memory, transient)
    private wakeConditions: WakeCondition[] = []

    // ── Messages ────────────────────────────────
    addMessage(msg: MailboxMessage): void
    getMessagesFor(performerKey: string): MailboxMessage[]
    markDelivered(messageId: string): void  // status → delivered, 이후 삭제

    // ── Board ───────────────────────────────────
    postToBoard(entry: BoardEntry): void    // writePolicy 검증 포함
    readBoard(key: string, options?: { latestOnly?: boolean; limit?: number }): BoardEntry[]
    getBoardSnapshot(): BoardEntry[]

    // ── WakeCondition ───────────────────────────
    addWakeCondition(condition: WakeCondition): void
    evaluateConditions(event: MailboxEvent): WakeCondition[]  // triggered 반환
    removeCondition(conditionId: string): void

    // ── Lifecycle ───────────────────────────────
    shutdown(): { board: BoardEntry[] }  // ephemeral 폐기, durable 반환
}
```

### `server/services/act-runtime/event-logger.ts` [NEW]

Event log (append-only `.jsonl` file):

```ts
// 파일 경로: .dance-of-tal/act-logs/<actId>/<threadId>.jsonl

class EventLogger {
    constructor(actId: string, threadId: string)

    appendEvent(event: MailboxEvent): Promise<void>
    tailEvents(count: number): Promise<MailboxEvent[]>  // UI Activity View용
}
```

### `server/services/act-runtime/thread-manager.ts` [NEW]

Act Thread lifecycle:

```ts
class ThreadManager {
    // Thread CRUD
    createThread(actId: string): ActThread
    getThread(threadId: string): ActThread | null
    listThreads(actId: string): ActThread[]

    // Status transitions
    markActive(threadId: string): void
    markIdle(threadId: string): void
    markCompleted(threadId: string): void
    markInterrupted(threadId: string): void  // shutdown 시

    // Performer session 매핑
    getOrCreateSession(threadId: string, performerKey: string): string  // sessionId 반환
    getPerformerSession(threadId: string, performerKey: string): string | null

    // Shutdown
    shutdownAllThreads(): void  // active/idle → interrupted, ephemeral 폐기
}
```

### `server/services/act-runtime/wake-evaluator.ts` [NEW]

WakeCondition 평가:

```ts
function evaluateCondition(
    condition: ConditionExpr,
    context: {
        board: Map<string, BoardEntry>
        recentEvents: MailboxEvent[]
    }
): boolean

// all_of → 모든 sub-condition 충족
// any_of → 하나 이상 충족
// board_key_exists → board에 해당 key 존재
// message_received → event stream에서 해당 sender/tag event 발생 여부
// timeout → 현재 시각 >= at
```

### `server/services/act-runtime/board-persistence.ts` [NEW]

Board file persistence:

```ts
// 파일 경로: .dance-of-tal/act-data/<actId>/<threadId>/board.json

function saveBoardToFile(actId: string, threadId: string, entries: BoardEntry[]): Promise<void>
function loadBoardFromFile(actId: string, threadId: string): Promise<BoardEntry[]>
```

---

## Data lifecycle 구현 규칙

| 데이터 | 저장소 | Shutdown 시 |
|--------|--------|------------|
| pending messages | in-memory | 폐기 |
| board | file-backed + memory cache | file 유지 |
| events | `.jsonl` file | file 유지 |
| wake conditions | in-memory | 폐기 |

---

## 검증 기준

- [ ] Thread 생성 → mailbox 초기화 → message send/deliver → board post/read 흐름 검증
- [ ] WakeCondition `all_of`, `any_of` 조합 평가 정확성
- [ ] Shutdown 시 board/event log 유지, pending message/wake condition 폐기 확인
- [ ] Event log `.jsonl` 파일 append-only 동작 검증
- [ ] Board file persistence (save → restart → load) 검증
