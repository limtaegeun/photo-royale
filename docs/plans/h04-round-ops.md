# H04 라운드 운영 — 운영 탭 실구현 계획

- **브랜치**: `feat/h04-round-control`
- **작성일**: 2026-07-25 (계획: Fable, 구현: Opus 세션에서 진행)
- **선행 자료**: `docs/qa/round-ops.md`(스켈레톤 live-qa 50 TC), H04 목업 스크린샷

## 0. 배경 — 현재 상태

`src/features/round-ops/RoundOpsPage.vue`는 **정적 스켈레톤**이다: 탭 3개(운영/판정/기록), 예시 상수(`EXAMPLE_*`) 표시, 모든 컨트롤은 "준비 중" 토스트. 방 문서 구독 없음, Firestore 쓰기 없음. 이번 작업은 **운영 탭을 실동작으로 연결**하는 것이고, 판정/기록 탭은 mock(준비 중 카드) 유지.

## 1. 확정 스펙 (사용자 Q&A 결과)

| # | 결정 사항 | 확정안 |
|---|---|---|
| 1 | 타이머 정본 | **Firestore 동기화** — room 문서에 라운드 상태 필드 추가 + `firestore.rules` 갱신. 새로고침 복원, 향후 게스트 화면도 같은 데이터 구독 |
| 2 | 라운드 시작 | **호스트 수동 시작** ('라운드 시작' 버튼), 기본 **20분**, ±1분 조정으로 보정 |
| 3 | 공지 | **자유 텍스트 입력**(바텀시트) → `rooms/{code}/notices` 서브컬렉션 append(히스토리). 운영 탭에 최근 공지 표시. **게스트 수신 UI는 범위 제외**(카메라 콕핏 미완성) |
| 4 | 판정 대기 행 | **화면에서 제거**(판정 탭 mock은 유지). 타이머 요약은 실데이터: `라운드 N(assignmentRound) · 상태 · M팀 배정(참가자에서 파생)` |

## 2. 데이터 모델

### 2.1 `rooms/{code}` 문서 — `round` 맵 필드 추가 (top-level 키 1개)

```ts
round?: {
  status: 'running' | 'paused'   // 필드 자체가 없으면 라운드 시작 전
  startedAt: Timestamp            // running 구간의 시작 — serverTimestamp() (재개 시 갱신)
  durationMs: number              // running 구간의 총량 — 시작 20분, 재개 시 남은량으로 리셋, 반영 시 ±60000
  pausedRemainingMs: number | 없음 // paused일 때만 존재 — 정지 순간의 남은 ms
}
```

**설계 근거**
- top-level 키를 `round` 하나로 묶으면 rules의 `affectedKeys().hasOnly(['round'])` 검사가 단순해진다(기존 status/배정 갈래와 충돌 없음).
- `startedAt: serverTimestamp()` 앵커 방식이라 **호스트 기기 시계 오차가 참가자에게 전파되지 않는다**. 각 뷰어의 남은 시간 = `durationMs - (로컬 now - startedAt)` — 뷰어 본인 시계 오차만 영향(파티 게임 허용 범위, 알려진 한계로 문서화).
- 라운드 번호는 새 필드 없이 **기존 `assignmentRound`를 그대로 사용**(팀편성 차수 = 라운드).

**상태 전이** (모두 호스트 전용, `status == 'playing'`에서만)
| 액션 | 쓰기 내용 |
|---|---|
| 라운드 시작 | `round = { status:'running', startedAt: serverTimestamp(), durationMs: 1_200_000 }` |
| 일시정지 | `round = { status:'paused', startedAt 유지, durationMs 유지, pausedRemainingMs: 현재 남은 ms }` |
| 재개 | `round = { status:'running', startedAt: serverTimestamp(), durationMs: pausedRemainingMs }` (pausedRemainingMs 제거) |
| 시간 반영(±N분) | running: `durationMs += delta` / paused: `pausedRemainingMs += delta` (0 미만 방지: 최소 0) |
| 종료(0 도달) | **쓰기 없음** — 클라이언트가 remaining ≤ 0을 '종료'로 표시. '라운드 시작'을 다시 노출해 타이머 재시작 허용(다음 라운드 재배정 플로우는 별도 작업) |

### 2.2 `rooms/{code}/notices/{autoId}` 서브컬렉션 신설

```ts
{ text: string /* 1~100자 */, createdAt: Timestamp /* serverTimestamp */ }
```

- 운영 탭은 최신 1건 표시(`orderBy createdAt desc, limit 1` 구독). 전체 이력은 후속(기록 탭) 재료.
- 공지 글자수 상한(100자)은 상수로 정의하고 rules와 문자열/숫자 대조 테스트로 동기화(기존 `ROOM_CODE_PATTERN` 패턴 답습).

### 2.3 `firestore.rules` 변경 (⚠️ 앱과 함께 배포 필수 — qa 문서 체크리스트 0번 전례)

1. `rooms/{roomCode}` update에 **3번째 갈래** 추가:
   - `affectedKeys().hasOnly(['round'])` && `resource.data.status == 'playing'` && 호스트 본인(기존 외곽 조건)
   - `round.status in ['running','paused']`, `durationMs is int && durationMs >= 0 && durationMs <= 10800000`(3시간 상한), `startedAt is timestamp`, paused면 `pausedRemainingMs is int && >= 0`, running이면 `pausedRemainingMs` 부재(`!('pausedRemainingMs' in ...)`)
2. `match /notices/{noticeId}` 신설:
   - `read`: 로그인 사용자(참가자가 코드 경로로 구독 — participants와 동일 정책)
   - `create`: 호스트 본인 && `keys().hasOnly(['text','createdAt'])` && `text is string && size 1~100` && `createdAt == request.time`
   - `update, delete`: false

## 3. 파일별 작업 목록

### 신규 — `src/features/round-ops/`

| 파일 | 내용 |
|---|---|
| `api/round.ts` | `ROUND_DURATION_DEFAULT_MS`, `ROUND_ADJUST_STEP_MS`(60000) 상수 + `startRound(code)` / `pauseRound(code, remainingMs)` / `resumeRound(code, remainingMs)` / `adjustRound(code, round, deltaMs)` — `updateDoc(doc(db,'rooms',code), { round: ... })` |
| `api/notices.ts` | `NOTICE_TEXT_MAX_LENGTH`(100) + `sendNotice(code, text)` / `subscribeToLatestNotice(code, onChange)` |
| `composables/useRoundTimer.ts` | `round` ref를 받아 1초 tick으로 `remainingMs`/`formatted(mm:ss)`/`isEnded` 계산. `setInterval` + `visibilitychange` 시 즉시 재계산(화면 잠금 복귀 대응, qa G-01), unmount 시 정리 |
| `stores/useRoundOpsStore.ts` | 방 문서·참가자·최근 공지 구독 orchestration + 액션(시작/정지/재개/반영/공지 전송) + `pendingAdjustMinutes`(로컬 대기값) + 에러 상태. `enter(code)`/`leave()`로 구독 수명 관리(waiting-room store 패턴 답습) |
| `components/RoundTimerCard.vue` | hero 타이머 + 실데이터 요약(`라운드 N · 진행 중/일시정지/종료 · M팀 배정`) |
| `components/TimeAdjustCard.vue` | −1분/+1분 스테퍼(로컬 누적) + 반영 버튼(대기값 0이면 disabled) + 캡션 `대기 변경값: +N분 · 반영 시 모든 참가자에게 적용` |
| `components/NoticeCard.vue` | 최근 공지 미리보기(없으면 빈 상태 문구) + '공지 보내기' 버튼 |
| `components/NoticeSheet.vue` | `BaseBottomSheet` + `BaseInput`(1~100자, 카운터) + 전송. 성공 시 토스트·시트 닫기·입력 초기화 |

### 수정

| 파일 | 내용 |
|---|---|
| `RoundOpsPage.vue` | 스켈레톤 제거(EXAMPLE 상수·고지문·notifyPreparing·판정 대기 행 삭제) → store 연결. 상태별 렌더(§4). 판정/기록 탭 mock 카드는 유지 |
| `features/waiting-room/api/rooms.ts` | `RoomInfo`에 `round: RoundState \| null` 추가(+`RoundState` 타입), `getRoom`/`subscribeToRoom` 매핑 확장 |
| `features/waiting-room/index.ts` | `subscribeToRoom`, `subscribeToParticipants`, `isAssignedInRound` + `RoomInfo`/`RoundState`/`Participant` 타입 export 추가(공개 표면 최소 유지) |
| `firestore.rules` | §2.3 |
| `shared/components/BaseToastProvider.vue` (검토) | qa C-05: 토스트가 하단 탭을 4초간 완전히 덮음. 실컨트롤 연결로 조작 빈도가 오르므로 토스트 뷰포트 bottom 오프셋을 안전영역+탭 높이만큼 올리는 방향 검토(전역 영향이라 신중히 — 최소 변경으로) |
| `CLAUDE.md` | 구조 규칙 변화 없으면 갱신 불필요. rules 배포 절차 등은 qa 문서가 담당 |

### 삭제 없음 (판정 대기 행은 코드에서 제거되지만 파일 삭제는 없음)

## 4. UI 상세 — 상태별 렌더 (디자인 시스템 준수)

공통: 시맨틱 유틸리티만 사용(primitive·arbitrary 색 금지), 카드는 `BaseCard`, 리스트 행은 `BaseListRow`, 여백은 컨테이너 `gap`, 터치 타겟 48px+.

| 라운드 상태 | 배지(ROOM 행) | 타이머 카드 | 주 액션 영역 | 시간 조정 |
|---|---|---|---|---|
| 시작 전(`round` 없음) | `neutral` "대기" | `20:00`(기본값) + 요약, `text-content-secondary` | **'라운드 시작'** primary lg 풀폭 1개 | 카드 미노출(또는 disabled — 미노출 권장, 시작 전 조정은 의미 없음) |
| running | `success` "LIVE" | 남은 시간 `text-success`, 1초 갱신 | 2열: **일시정지**(danger) 활성 / **재개**(accent) disabled | 활성 |
| paused | `warning` "일시정지" | 남은 시간 `text-warning` 고정 | 2열: 일시정지 disabled / **재개** 활성 | 활성 |
| 종료(remaining ≤ 0) | `neutral` "종료" | `00:00` `text-content-secondary` + 요약에 '종료' | **'라운드 시작'**(재시작) 풀폭 | 미노출 |

- 요약 줄: `라운드 {assignmentRound} · {상태 라벨} · {이번 라운드 배정 팀 수}팀 배정` — 팀 수는 `participants`에서 `isAssignedInRound` 필터 후 `team` 고유값 개수.
- 공지 카드: 최근 공지 텍스트 + 상대 시각(예: '방금'·'N분 전'), 없으면 "아직 보낸 공지가 없어요". 액션 버튼으로 시트 오픈.
- **하단 탭 고정(qa B-06 해결)**: 탭 바를 `sticky bottom-0` + `bg-canvas` + safe-area 인셋으로 전환 — 목업이 하단 고정 탭이고, 스크롤 필요 문제 해소.
- 스켈레톤 고지문(`role="status"`) 삭제 — 실데이터 연결로 존재 이유 소멸.
- 색+라벨 병기 원칙: 상태는 배지 텍스트로 항상 병기(LIVE/일시정지/종료).

## 5. 가드·엣지 케이스

1. **호스트 가드 신설**: 컨트롤이 실쓰기가 되므로 게스트가 URL 직접 진입하면 403 UX가 발생한다. 방 구독 후 `auth.uid !== hostUid`면 redirect — `status === 'playing'`이면 `/camera`, 아니면 `/waiting-room/{code}`. 방이 없으면(`null`) 안내 토스트 + entry(`/`)로. (qa R-3, D-04·D-06의 스펙 변경)
2. **낙관적 잠금 불필요**: 호스트 기기 1대 전제. 같은 계정 다중 창(qa A-09)은 스냅샷 구독으로 자연 수렴.
3. **시간 반영 시 음수 방지**: 반영 결과 remaining < 0이 되면 0으로 클램프(즉시 종료 표시).
4. **오프라인**: 액션 실패 시 에러 토스트(`다시 시도해 주세요`), 화면은 마지막 스냅샷 유지. Firestore SDK 오프라인 쓰기 큐는 그대로 활용.
5. **일시정지의 pausedRemainingMs**는 클릭 순간 클라 계산값 — startedAt/durationMs 앵커에서 파생하므로 오차는 클릭 시점 스큐뿐(허용).
6. `status !== 'playing'` 방(waiting)에서 진입 시: 컨트롤 대신 "게임이 아직 시작되지 않았어요" 안내(rules도 playing에서만 round 쓰기 허용).

## 6. 테스트 계획 (`__tests__/` 콜로케이션)

| 대상 | 케이스 |
|---|---|
| `api/round.ts` | 시작/정지/재개/반영 각각의 쓰기 payload 검증(firestore mock — rooms.spec 패턴), durationMs 클램프 |
| `api/notices.ts` | 전송 payload·글자수 상한, **rules 문자열 대조**(상한 100·rules 갈래 존재 — rooms.spec의 패턴 동기화 테스트 답습) |
| `useRoundTimer` | fake timers로 카운트다운·paused 고정·0 도달 isEnded·visibilitychange 재계산·정리 |
| `useRoundOpsStore` | 구독 연결/해제, pendingAdjust 누적·반영 후 초기화, 상태별 액션 가드, 에러 상태 |
| `RoundOpsPage` | 상태별 렌더 4종(시작 전/LIVE/일시정지/종료), 호스트 가드 redirect, 공지 시트 플로우, 판정/기록 mock 유지, 판정 대기 행 부재 |
| 기존 회귀 | waiting-room 전이 테스트(A-01·A-02) 무변경 통과 |

## 7. Definition of Done

1. `npm run type-check` + `npm run lint` + `npm run test:unit` 전부 통과.
2. **firestore.rules 변경은 앱과 함께 배포**해야 동작 — qa 문서 전례(배정 확정 403 사고)대로 배포 순서를 PR 본문에 명기.
3. 사용자 검증 전 커밋 금지(메모리 규칙) — 구현 완료 후 사용자에게 검증 요청.

## 8. 범위 제외 (명시)

- 판정 대기(건수·판정 플로우) — **보류 확정**, 화면에서 행 제거
- 판정/기록 탭 실구현 — mock(준비 중 카드) 유지
- 게스트(카메라 콕핏) 측 타이머·공지 **수신 UI** — 데이터는 이번 스키마를 그대로 구독하면 되도록 설계됨
- 라운드 종료 시 다음 라운드/재배정 플로우, 게임 종료(playing 되돌리기)
- 생존 팀 수(판정 의존) — 요약은 '배정 팀 수'로 대체
