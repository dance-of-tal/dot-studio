# Phase 4 — UI Components (Frontend)

> Act 관련 UI 컴포넌트를 choreography 모델에 맞게 전면 재작성한다.
> PRD §7, §17 범위.

---

## 목표

- Act Canvas: communication relation 시각화 (`↔` / `→`), performer 클릭 시 직접 대화
- Act Chat: Thread 기반 performer별 대화 패널
- Act Inspector: relation (communication contract), subscriptions 편집
- Sidebar: Act → Thread → Performer 3단 계층 네비게이션
- Activity View: mailbox event 실시간 표시

---

## 삭제 대상

### `src/features/act/` — 전체 재작성

| 파일 | 삭제 사유 |
|------|----------|
| `ActFrame.tsx` / `.css` | orchestration 기반 (entry performer, execution mode 표시) |
| `ActChatPanel.tsx` / `.css` | entry performer 기반 단일 채팅 → Thread 내 performer별 채팅으로 교체 |
| `ActInspectorPanel.tsx` / `.css` | from/to 단방향 relation 편집 → between 양방향 contract 편집으로 교체 |
| `ActPerformerFrame.tsx` / `.css` | copy 기반 performer 표시 → ref binding 기반으로 교체 |

---

## 새로 작성할 컴포넌트

### `src/features/act/ActFrame.tsx` [REWRITE]

Act canvas node:

- Act 이름, 설명 표시
- 내부 performer nodes (ref binding 기반, 이름 + 아이콘)
- Relation edges: `↔` (both) 또는 `→` (one-way) 시각적 구분
- Act click → edit focus mode 진입
- Performer node click → Thread 내 해당 performer 대화로 이동

### `src/features/act/ActChatPanel.tsx` [REWRITE]

Thread 기반 performer별 채팅:

```
┌────────────────────────────────┐
│ Thread 1                       │
│ ┌────┬────────┬────────┐      │
│ │Code│Reviewer│Tester  │ ← tab│
│ └────┴────────┴────────┘      │
│                                │
│ [채팅 메시지 영역]              │
│                                │
│ ─── wake-up prompt ─────────── │  ← 시각적 구분: 다른 performer의
│                                │    wake-up vs user input
│ [입력창]                        │
└────────────────────────────────┘
```

핵심 UX:

- Thread 내 performer 탭으로 전환
- User input은 일반 OpenCode session prompt (mailbox 바깥)
- Wake-up prompt는 시각적으로 구분 (다른 색상/아이콘)
- `+ New Thread` 버튼

### `src/features/act/ActInspectorPanel.tsx` [REWRITE]

Act 정의 편집 패널:

**Act 레벨:**
- 이름, 설명
- Act Rules (문자열 목록)

**Performer Binding 편집:**
- performer ref 선택 (기존 standalone performer 또는 registry)
- Active dances 선택
- Subscriptions 편집:
  - messagesFrom (performer 목록)
  - messageTags (태그 목록)
  - boardKeys (키 패턴 목록)
  - eventTypes (이벤트 타입 목록)

**Relation 편집:**
- `between`: performer pair 선택
- `direction`: both / one-way 토글
- `name`, `description`
- Permissions:
  - boardKeys (반응 가능 board key 범위)
  - messageTags (허용 message tag 범위)
- `maxCalls`, `timeout`
- `sessionPolicy`: fresh / reuse

### `src/features/act/ActPerformerFrame.tsx` [REWRITE]

Act 내부 performer node (canvas):

- Performer 이름 (ref에서 resolve)
- 아이콘 (연결 상태)
- Active dances 표시
- Subscription 인디케이터 (어떤 관심사가 있는지 요약)
- Click → 해당 performer와 대화 (Thread context)

### `src/features/act/ActActivityView.tsx` [NEW]

PRD §17.2 Activity / Artifact View:

- performer 간 협업 흐름 타임라인
- 주요 board 산출물 목록
- 현재 active performer 표시
- 최근 이벤트 요약
- Event log SSE로 실시간 업데이트

```
┌─────────────────────────────────────┐
│ Activity                             │
│                                      │
│ ● Coder → post_to_board("api-spec") │
│ ○ Reviewer ← wake-up (board.posted) │
│ ● Reviewer → send_message(tag=review)│
│ ○ Coder ← wake-up (message.sent)    │
│                                      │
│ ── Board ────────────────────────── │
│ api-spec: REST API 초안 (v2)         │
│ review-report: 리뷰 결과 (v1)        │
└─────────────────────────────────────┘
```

### `src/features/act/ActThreadSelector.tsx` [NEW]

Thread 목록 및 선택:

- 현재 Act의 Thread 목록 (status 표시)
- Active Thread 선택
- `+ New Thread` 생성 버튼

---

## Sidebar 변경

### 기존 Sidebar Act 영역 수정

```
현재:
  Acts
  └── 웹앱 개발 → (click: focus mode)

변경:
  Acts
  ├── 웹앱 개발
  │   ├── Thread 1 (active)
  │   │   ├── Coder ← (click: 대화)
  │   │   ├── Reviewer
  │   │   └── Tester
  │   ├── Thread 2 (idle)
  │   └── + New Thread
  └── 데이터 파이프라인
      └── Thread 1
```

---

## Canvas Edge 변경

### Relation 시각화

| 기존 | 변경 |
|------|------|
| `from → to` 단방향 화살표 | `↔` 양방향 선 (direction: both) |
| 실행 호출 의미 | communication contract 의미 |
| invocation/await 속성 표시 | permissions (boardKeys, messageTags) 표시 |

Edge 스타일:

- `both`: 양쪽 끝에 원형/화살표, 실선
- `one-way`: 한쪽 끝 화살표, 점선

---

## 검증 기준

- [ ] Act Canvas에서 `↔` / `→` relation 올바르게 표시
- [ ] Thread 생성 → performer 탭 전환 → 각 performer와 독립 대화 가능
- [ ] Wake-up prompt가 user input과 시각적으로 구분
- [ ] Inspector에서 relation (between, direction, permissions) 편집 가능
- [ ] Inspector에서 subscription (messagesFrom, boardKeys 등) 편집 가능
- [ ] Activity View에서 event log 실시간 표시
- [ ] Sidebar 3단 계층 (Act → Thread → Performer) 네비게이션 동작
- [ ] `npm run build` 성공
