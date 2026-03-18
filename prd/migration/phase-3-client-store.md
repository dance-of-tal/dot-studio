# Phase 3 — Client Store & State (Frontend)

> Act 관련 Zustand store를 choreography 모델로 전면 교체한다.
> Thread 관리, Sidebar 계층, performer session 추적 구현.
> PRD §5, §7, §17 범위.

---

## 목표

- `actSlice.ts` 전면 재작성 — orchestration 기반 상태 제거, Thread 중심 상태 관리 도입
- Thread → Performer Session 계층 구조의 client state
- Sidebar 3단 계층 (Act → Thread → Performer 대화) 데이터 모델
- Act 정의 편집 (relation = communication contract, performer binding, subscriptions)

---

## 삭제 대상

### `src/store/actSlice.ts` — 전체 재작성

삭제할 상태/액션:

| 상태/액션 | 삭제 사유 |
|----------|----------|
| `executionMode` 관련 (`setActExecutionMode`) | orchestration 패턴 잔재 |
| `entryPerformerKey` 관련 (`setActEntryPerformer`) | 중앙 entry 강제 제거 (PRD §8) |
| `copyPerformerConfig()` | performer copy 모델 → ref binding으로 교체 |
| `addPerformerToAct()` (copy 기반) | performer ref binding 방식으로 교체 |
| `syncPerformerFromCanvas()` | copy sync 불필요 — ref 직접 참조 |
| `addRelationInAct()` (from/to 단방향) | `between` 양방향 relation으로 교체 |
| `importActFromAsset()` (nodes/edges 기반) | 새 registry schema 기반으로 교체 |

### `src/store/types.ts` 내 `ActSlice` 타입

- 위 액션들의 시그니처 전부 교체

---

## 새로 작성할 Store

### `src/store/actSlice.ts` [REWRITE]

```ts
interface ActSlice {
    // ── Act Definition 상태 ─────────────────────
    acts: StageAct[]
    selectedActId: string | null
    editingActId: string | null
    selectedActPerformerKey: string | null
    selectedRelationId: string | null

    // ── Act Thread 상태 ─────────────────────────
    actThreads: Record<string, ActThreadState[]>  // actId → threads
    activeThreadId: string | null
    activeThreadPerformerKey: string | null  // Thread 내 현재 보고 있는 performer

    // ── Act Definition CRUD ─────────────────────
    addAct: (name: string) => string
    removeAct: (id: string) => void
    renameAct: (id: string, name: string) => void
    updateActDescription: (id: string, description: string) => void
    updateActRules: (id: string, rules: string[]) => void
    selectAct: (id: string | null) => void
    toggleActVisibility: (id: string) => void
    toggleActEdit: (id: string | null) => void

    // ── Performer Binding (ref 기반) ────────────
    bindPerformerToAct: (actId: string, performerRef: AssetRef) => string  // key 반환
    unbindPerformerFromAct: (actId: string, performerKey: string) => void
    updatePerformerBinding: (actId: string, performerKey: string, update: Partial<StageActPerformerBinding>) => void
    selectActPerformer: (key: string | null) => void

    // ── Relation (communication contract) ───────
    addRelation: (actId: string, between: [string, string], direction: 'both' | 'one-way') => void
    removeRelation: (actId: string, relationId: string) => void
    updateRelation: (actId: string, relationId: string, update: Partial<ActRelation>) => void
    selectRelation: (id: string | null) => void

    // ── Thread 관리 ─────────────────────────────
    createThread: (actId: string) => Promise<string>  // API 호출 → threadId
    selectThread: (threadId: string | null) => void
    selectThreadPerformer: (performerKey: string | null) => void
    loadThreads: (actId: string) => Promise<void>

    // ── Canvas ──────────────────────────────────
    updateActPosition: (id: string, x: number, y: number) => void
    updateActSize: (id: string, width: number, height: number) => void
    updateActPerformerPosition: (actId: string, performerKey: string, x: number, y: number) => void

    // ── Focus mode ──────────────────────────────
    enterActEditFocus: (actId: string) => void
    exitActEditFocus: () => void

    // ── Import ──────────────────────────────────
    importActFromAsset: (asset: any) => void  // 새 registry schema 기반
}
```

### `src/store/actSlice.ts` 내 Thread Client State

```ts
interface ActThreadState {
    id: string
    actId: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    performerSessions: Record<string, string>  // performerKey → sessionId
    createdAt: number
}
```

---

## API 연동

### `src/api.ts` 추가 함수

```ts
// Thread management
createActThread(actId: string): Promise<{ threadId: string }>
listActThreads(actId: string): Promise<ActThreadState[]>

// Act runtime events (Activity View용)
subscribeActEvents(actId: string, threadId: string): EventSource

// Thread performer session
getThreadPerformerSession(actId: string, threadId: string, performerKey: string): Promise<string>
```

---

## Sidebar 데이터 모델

PRD §5.4 3단 계층:

```
Acts
├── 웹앱 개발 (act)
│   ├── Thread 1
│   │   ├── Coder (performer 대화)
│   │   ├── Reviewer
│   │   └── Tester
│   ├── Thread 2
│   │   ├── Coder
│   │   └── Reviewer
│   └── + New Thread
└── 데이터 파이프라인
    └── Thread 1
        ├── Architect
        └── Implementer
```

Store에서 sidebar 렌더에 필요한 derived state:

```ts
// selector
function selectActSidebarTree(state: StudioState): ActSidebarNode[] {
    return state.acts.map(act => ({
        actId: act.id,
        actName: act.name,
        threads: (state.actThreads[act.id] || []).map(thread => ({
            threadId: thread.id,
            status: thread.status,
            performers: Object.entries(act.performers).map(([key, binding]) => ({
                performerKey: key,
                performerName: resolvePerformerName(binding.performerRef),
                sessionId: thread.performerSessions[key] || null,
            }))
        }))
    }))
}
```

---

## 검증 기준

- [ ] Act 생성 → performer binding → relation 추가가 새 타입으로 동작
- [ ] Thread 생성 API → client state 반영
- [ ] Sidebar tree가 Act → Thread → Performer 3단 계층 표시
- [ ] Thread 내 performer 선택 시 해당 session 연결
- [ ] Act edit focus mode가 새 구조에서 동작
- [ ] `npm run build` 성공
