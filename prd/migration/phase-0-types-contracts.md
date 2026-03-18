# Phase 0 — Types & Contracts Rewrite

> 기존 orchestration 기반 Act 타입을 choreography 기반으로 전면 교체한다.
> 이 phase는 다른 모든 phase의 기반이 된다.

---

## 목표

- 레거시 orchestration 모델(`entryPerformerKey`, `executionMode`, 단방향 edge 등) 제거
- PRD §2–§6, §10–§12 기준으로 새 타입 시스템 구축
- shared contracts를 server/client 모두 사용할 수 있게 정의

---

## 삭제 대상

### `src/types/index.ts`

| 타입 | 삭제 사유 |
|------|----------|
| `ActRelation` (기존) | `from/to` 단방향 + `invocation/await` → 양방향 communication contract로 교체 |
| `ActPerformer` (기존) | `sourcePerformerId` copy 모델 → `ActPerformerBinding` ref 모델로 교체 |
| `StageAct` (기존) | `executionMode`, `entryPerformerKey` 등 orchestration 잔재 전부 제거 |

### `shared/draft-contracts.ts`

| 타입 | 삭제 사유 |
|------|----------|
| `ActDraftContent` | `executionMode`, `entryPerformerKey` 기반 → 새 구조로 교체 |
| `ActDraftPerformer` | performer copy 모델 기반 → ref binding 모델로 교체 |
| `ActDraftRelation` | 단방향 edge 모델 → `ActRelation` (§11)으로 교체 |

### `shared/chat-contracts.ts`

| 필드 | 삭제 사유 |
|------|----------|
| `ChatSendRequest.actRelations` | 기존 단방향 edge 기반 delegation → mailbox tool 기반으로 교체 |
| `ChatSendRequest.relatedPerformers` | orchestration용 multi-depth chaining → 삭제 |

---

## 새로 작성할 타입

### Core Types — `shared/act-types.ts` [NEW]

```ts
// ── Mailbox ─────────────────────────────────────────────

interface MailboxMessage {
    id: string
    from: string                // performerKey
    to: string                  // performerKey
    content: string
    threadId?: string
    correlationId?: string
    tag?: string                // review-request, clarification, approval-needed 등
    timestamp: number
    status: 'pending' | 'delivered'
}

interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'fact' | 'task'
    author: string
    content: string
    metadata?: Record<string, unknown>
    version: number
    timestamp: number
    ownership: 'authoritative' | 'collaborative'
    updateMode: 'replace' | 'append'
    writePolicy?: 'author-only' | 'relation-peers' | 'any'
    status?: 'open' | 'in_progress' | 'done'  // kind='task'
    threadId?: string
    correlationId?: string
}

type MailboxEventType =
    | 'message.sent'
    | 'message.delivered'
    | 'board.posted'
    | 'board.updated'
    | 'runtime.idle'

interface MailboxEvent {
    id: string
    type: MailboxEventType
    sourceType: 'performer' | 'user' | 'system'
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

// ── WakeCondition ───────────────────────────────────────

type ConditionExpr =
    | { type: 'all_of'; conditions: ConditionExpr[] }
    | { type: 'any_of'; conditions: ConditionExpr[] }
    | { type: 'board_key_exists'; key: string }
    | { type: 'message_received'; from: string; tag?: string }
    | { type: 'timeout'; at: number }

interface WakeCondition {
    id: string
    target: 'self'
    createdBy: string
    onSatisfiedMessage: string
    condition: ConditionExpr
    status: 'waiting' | 'triggered' | 'expired'
}

// ── Subscriptions ───────────────────────────────────────

interface PerformerSubscriptions {
    messagesFrom?: string[]
    messageTags?: string[]
    boardKeys?: string[]
    eventTypes?: MailboxEventType[]
}

// ── ActRelation (communication contract) ────────────────

interface ActRelation {
    id: string
    between: [string, string]           // performer pair
    direction: 'both' | 'one-way'
    name: string
    description?: string
    permissions?: {
        boardKeys?: string[]
        messageTags?: string[]
    }
    maxCalls: number
    timeout: number
    sessionPolicy?: 'fresh' | 'reuse'
}

// ── Act Definition ──────────────────────────────────────

interface ActPerformerBinding {
    performerRef: AssetRef
    activeDanceIds?: string[]
    subscriptions?: PerformerSubscriptions
}

interface ActDefinition {
    id: string
    name: string
    description?: string
    actRules?: string[]
    performers: Record<string, ActPerformerBinding>  // performerKey → binding
    relations: ActRelation[]
}

// ── Act Thread ──────────────────────────────────────────

interface Mailbox {
    pendingMessages: MailboxMessage[]
    board: Map<string, BoardEntry>
    wakeConditions: WakeCondition[]
}

interface ActThread {
    id: string
    actId: string
    mailbox: Mailbox
    performerSessions: Record<string, string>  // performerKey → sessionId
    createdAt: number
    status: 'active' | 'idle' | 'completed' | 'interrupted'
}
```

### Canvas Types — `src/types/index.ts` 수정

```ts
// StageAct → choreography 기반으로 교체
interface StageAct {
    id: string
    name: string
    description?: string
    actRules?: string[]
    position: { x: number; y: number }
    width: number
    height: number
    performers: Record<string, StageActPerformerBinding>
    relations: ActRelation[]
    hidden?: boolean
    createdAt: number
    meta?: {
        derivedFrom?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}

// performer copy → ref binding
interface StageActPerformerBinding {
    performerRef: AssetRef
    activeDanceIds?: string[]
    subscriptions?: PerformerSubscriptions
    position: { x: number; y: number }  // canvas 전용
}
```

### Draft Contracts — `shared/draft-contracts.ts` 수정

```ts
interface ActDraftContent {
    description?: string
    actRules?: string[]
    performers: Record<string, ActDraftPerformerBinding>
    relations: ActRelation[]
}

interface ActDraftPerformerBinding {
    performerRef: AssetRef
    activeDanceIds?: string[]
    subscriptions?: PerformerSubscriptions
}
```

### Chat Contracts — `shared/chat-contracts.ts` 수정

```ts
// ChatSendRequest에서 제거:
//   - actRelations (단방향 delegation)
//   - relatedPerformers (multi-depth chaining)
//
// 추가:
//   - actThreadId?: string  (Act Thread 내 실행임을 표시)

interface ChatSendRequest {
    message: string
    performer: { ... }            // 기존 유지
    attachments?: [...]           // 기존 유지
    mentions?: [...]              // 기존 유지
    actId?: string                // 기존 유지
    actThreadId?: string          // NEW: Thread 연결
}
```

---

## 검증 기준

- [ ] `npm run build` (TypeScript 컴파일) 성공
- [ ] 기존 `ActRelation`, `ActPerformer`, `StageAct` 타입 reference가 0건
- [ ] 새 타입들이 PRD §11 relation, §12 subscription/WakeCondition과 1:1 매핑

---

## 주의사항

> [!CAUTION]
> 이 phase는 **breaking change**다. 완료 후 다른 모든 phase가 이 타입에 의존하므로, 타입 교체 완료 후 컴파일 에러를 전부 해소해야 한다. Phase 1–4에서 참조하는 모든 코드가 이 타입 기준으로 작성된다.
