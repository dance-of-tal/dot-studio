# Phase 4 — UI Components (Frontend)

> Revised plan.
> dedicated `Act Edit` canvas mode를 걷어내고,
> main canvas authoring + callboard projection + left-sidebar runtime navigation으로 UI를 재구성한다.
> PRD §7, §17 범위.

이 phase는 incremental cleanup이 아니라 **full rewrite** 기준으로 진행한다.

---

## 목표

- 메인 캔버스에서 performer 연결만으로 Act를 authoring
- Act/participant/relation selection 기반 inspector
- Thread 기반 participant chat과 callboard/activity view를 명확히 분리
- 좌측 메뉴에서 definition과 runtime 경계를 직관적으로 표현

---

## 현재 코드 기준 문제

### 1. ActFrame 이 여전히 edit-mode 진입을 중심으로 설계됨

- `src/features/act/ActFrame.tsx`
- `src/components/canvas/CanvasArea.tsx`

현재는 Edit 버튼이 별도 focus canvas로 들어가는 전제다.
새 UX에서는 selection과 main canvas 조작이 중심이 되어야 한다.

### 2. Empty state 와 버튼 문구가 edit mode 를 전제함

- `src/features/act/ActChatPanel.tsx`
- `src/components/panels/StageExplorer.tsx`

현재 문구는 "Edit Act"로 performer binding을 유도한다.
새 방향에서는 캔버스 연결과 sidebar navigation을 유도해야 한다.

### 3. Sidebar 에서 participant 와 definition 의 의미가 아직 약함

- `src/components/panels/StageExplorer.tsx`

트리는 있으나, `Act row`, `Thread row`, `Participant row`, `Inbox row`의 의미 구분이 더 필요하다.

---

## 제거 또는 재설계 대상

### `src/features/act/ActFrame.tsx`

재설계 포인트:

- Edit 버튼 제거
- Act 선택과 Thread runtime 진입을 분리
- selection 상태에 따라 chat/activity를 전환

### `src/components/canvas/CanvasArea.tsx`

재설계 포인트:

- `isActEditFocus` 의존 로직 제거
- main canvas connect 로직이 Act 생성/확장 로직을 직접 호출
- act-specific toolbar 제거

### `src/features/act/ActInspectorPanel.tsx`

재설계 포인트:

- `editingActId` 기반이 아니라 `selectedActId` + selection target 기반
- Act / Participant / Relation selection만으로 열림

---

## 새 UI 방향

### `src/components/canvas/CanvasArea.tsx` [REWORK]

main canvas authoring:

- shared performer 두 개를 처음 연결하면 새 Act 생성
- 이미 같은 Act에 속한 performer를 연결하면 relation 추가
- Act를 선택하면 cluster 또는 frame이 활성화됨
- relation 클릭 시 inspector에서 contract 편집
- cross-act connection은 자동 merge하지 않고 explicit action으로 남김

### `src/features/act/ActFrame.tsx` [REWORK]

Act frame / cluster view:

- Act 이름, summary, 현재 thread indicator 표시
- Activity 탭과 Chat 탭 제공 가능
- edit-mode 진입 버튼 제거
- participant 또는 activity 선택은 sidebar와 동기화

### `src/features/act/ActChatPanel.tsx` [REWORK]

Thread participant chat:

```text
Act: Product Launch
Thread: #2

[Callboard] [Activity] [Strategist] [Operator]

- Callboard: shared entries + pinned context
- Activity: runtime projection
- Participant tab: 해당 thread participant session
```

핵심 UX:

- participant tab은 항상 thread-scoped session을 연다
- wake-up prompt는 user input과 시각적으로 구분한다
- thread가 없으면 "New Thread" CTA를 보여준다

### `src/features/act/ActInspectorPanel.tsx` [REWORK]

selection 기반 inspector:

- Act selection: 이름, 설명, rules
- Participant selection: active dances, subscriptions
- Relation selection: direction, permissions, timeout, session policy

### `src/features/act/ActActivityView.tsx` [KEEP/EXPAND]

표시 대상:

- callboard event timeline
- board artifacts
- current active performer
- unread / recent activity summary

Activity 는 thread 아래에 속해야 하며, act definition만 있을 때는 표시되지 않는다.

---

## Sidebar 변경

목표 구조:

```text
Performers
- Reviewer
- Coder

Acts
- Web App Build
  - Thread 1
    - Inbox / Activity
    - Reviewer @ T1
    - Coder @ T1
  - Thread 2
    - Inbox / Activity
    - Reviewer @ T2
```

클릭 의미:

- `Performers > Reviewer` → standalone definition / standalone sessions
- `Acts > Web App Build` → act definition selection
- `Thread 1` → activity 기본 보기
- `Reviewer @ T1` → thread participant session

---

## Canvas Relation 시각화

| 의미 | 표현 |
|------|------|
| `direction: both` | `↔`, 실선 |
| `direction: one-way` | `→`, 점선 또는 단일 arrow |

relation 은 실행 순서가 아니라 communication contract 임을 UI가 드러내야 한다.

---

## 검증 기준

- [ ] 메인 캔버스 연결만으로 새 Act authoring 이 가능하다
- [ ] dedicated edit mode 없이 Act/Participant/Relation 편집이 가능하다
- [ ] Thread 생성 후 participant chat이 thread-scoped session을 연다
- [ ] Activity view가 thread 아래에서만 보인다
- [ ] Sidebar 가 definition/runtime 경계를 명확히 보여준다
- [ ] Wake-up prompt와 user input이 구분되어 보인다
- [ ] `npm run build` 성공
