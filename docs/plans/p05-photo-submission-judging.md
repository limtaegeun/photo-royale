# P05 사진 제출 + 호스트 판정 탭 — 구현 계획

- **브랜치**: `feat/p05-photo-submission-judging`
- **작성일**: 2026-07-26
- **선행 자료**: `docs/plans/h04-round-ops.md`(판정 탭 보류 이력), `docs/qa/camera-cockpit.md`(킬샷 확인 화면·`제출 준비 중` 자리), 와이어프레임 3장(예시 — 디자인 시스템 기준으로 디벨롭)

## 0. 배경 — 현재 상태

- 카메라 콕핏(`CameraPage.vue`)의 킬샷 확인 화면은 `다시 찍기` + **hard-disabled `제출 준비 중`** 버튼으로 끝난다. 사진은 브라우저 메모리의 Blob/object URL로만 존재하고 어디에도 전송되지 않는다.
- 호스트 운영 페이지(`RoundOpsPage.vue`)의 **판정 탭은 "준비 중" 카드 mock**이다.
- 생존/탈락 데이터 모델은 아직 없다 — 판정 결과 기록까지가 이번 범위, 생존 수 반영은 후속.

## 1. 확정 스펙 (사용자 지시)

| # | 결정 사항 | 확정안 |
|---|---|---|
| 1 | 공격할 팀 선택 | **제출자는 선택하지 않는다** — 촬영 → 확인 → 제출 끝. 대상 팀 식별은 호스트가 판정 시 수행 |
| 2 | 판정 탭 헤더 | 와이어프레임의 `판정큐` 대신 **`판정`** |
| 3 | 판정 액션 | **반려 사유 선택 없음.** 대상이 "어떤 팀·어떤 그룹"인지 선택하는 UI + **반려 버튼 1개**만 둔다 |
| 4 | 와이어프레임 | 예시일 뿐 — 레이아웃·컴포넌트는 디자인 시스템(docs/DESIGN_SYSTEM.md)에 맞춰 디벨롭 |

## 2. 데이터 모델

### 2.1 사진 저장 방식 — Firestore 인라인 데이터 URL

Firebase Storage는 미구성(`firebase.json`에 storage 블록·`storage.rules` 없음)이고 신규 버킷은 Blaze 요금제가 필요하다. 파티 게임 킬샷은 판정용 1회성 이미지이므로 **클라이언트에서 다운스케일·압축한 JPEG 데이터 URL을 Firestore 문서에 인라인 저장**한다(문서 한도 1MiB).

- 압축 파이프라인: 캡처 Blob → 캔버스 리사이즈(최장변 1280px, quality 0.7) → `toDataURL('image/jpeg')`. 결과가 상한을 넘으면 (1280, 0.7) → (960, 0.55) → (640, 0.4) 순으로 재시도.
- `SUBMISSION_PHOTO_MAX_LENGTH = 900000`(문자) — rules와 숫자까지 동일해야 하며 spec이 rules 파일을 읽어 대조 검증(기존 `ROUND_DURATION_MAX_MS` 패턴).

### 2.2 `rooms/{code}/submissions/{autoId}` 서브컬렉션 신설

```ts
{
  uid: string          // 제출자 — request.auth.uid와 일치 강제
  team: string         // 제출 시점의 제출자 완장(A~Z 1글자) — 참가자 문서와 대조 강제
  round: number        // 제출 시점의 assignmentRound — 방 문서와 대조 강제
  photo: string        // 'data:image/jpeg;base64,...' 데이터 URL
  status: 'pending' | 'approved' | 'rejected'   // 생성 시 'pending' 고정
  createdAt: Timestamp // serverTimestamp
  // ↓ 판정 시(호스트 update)에만 추가
  targetTeam?: string  // approved일 때 필수(A~Z 1글자), rejected면 부재 강제
  targetParticipantUid?: string // targetTeam의 현재 라운드 실제 배정을 증명할 참가자
  judgedAt?: Timestamp // serverTimestamp
}
```

- 완장은 라운드마다 바뀌므로 `team`/`round`를 제출 시점에 스냅샷한다. 닉네임은 저장하지 않는다 — participants 문서(ID=uid, 삭제 불가)에서 클라이언트 조인.
- 그룹은 저장하지 않는다 — 완장에서 파생(`groupForArmband`)이 정본.

### 2.3 `firestore.rules` — `match /submissions/{submissionId}` 신설

- `read`: 방 호스트 또는 해당 방 참가자만 허용(사진 데이터 URL 보호)
- `create`: 본인(`uid == request.auth.uid`) && 방이 `playing` && `round == 방.assignmentRound` && **본인 참가자 문서의 `team`·`assignedRound`와 일치**(이번 라운드 배정자만 제출 가능) && `photo`는 `data:image/jpeg;base64,` 접두 + 길이 1~900000 && `status == 'pending'` && `createdAt == request.time` && 키 화이트리스트
- `update`: 방이 `playing` && 호스트 본인 && 현재 `assignmentRound`의 pending 문서 && `affectedKeys hasOnly(['status','targetTeam','targetParticipantUid','judgedAt'])`. approved면 대상 참가자 문서의 `team`·`assignedRound`로 실제 현재 팀임을 검증하고, rejected면 두 대상 필드 부재를 강제한다.
- `delete`: false

⚠️ **rules는 앱과 함께 배포 필수**(H04 전례) — PR 본문에 배포 순서 명기.

## 3. 파일별 작업 목록

### 신규 — `src/features/round-ops/` (submissions의 소유 기능 = 판정 주체)

| 파일 | 내용 |
|---|---|
| `api/submissions.ts` | 제출 상수·`Submission`/`SubmissionTarget` 타입, `submitKillshot(code, input)`, `subscribeToPendingSubmissions(code, round, ...)`(`status`+현재 차수 필터), `approveSubmission(code, id, target)` / `rejectSubmission(code, id)` |
| `components/JudgeQueueList.vue` | 판정 탭 본문 — `BaseSectionHeader title="판정"` + aside `대기 N건` 배지, 대기 큐 카드 목록(썸네일 + 제출 팀 완장/그룹 + 제출자 이름 + 상대 시각), 빈 상태 문구 |
| `components/JudgeSheet.vue` | `BaseBottomSheet` — 사진 크게 보기 + 제출 정보 + **대상 팀 선택기**(그룹 색 4섹션으로 이번 라운드 배정 팀 나열, `GameModePicker` 행 패턴·`aria-pressed`) + `판정 확정`(선택 전 disabled) + `반려`(danger) |

### 수정

| 파일 | 내용 |
|---|---|
| `stores/useRoundOpsStore.ts` | 현재 배정 차수별 `pendingSubmissions` 구독·재구독, 독립 listen 오류 상태, `RoundOpsAction`의 `'judge'`, `approveSubmission`/`rejectSubmission` 액션 |
| `RoundOpsPage.vue` | 판정 탭 "준비 중" 카드를 `JudgeQueueList`로 교체, 시트 오픈 상태 관리. 기록 탭 mock은 유지 |
| `round-ops/index.ts` | `submitKillshot`, `Submission`, `SUBMISSION_PHOTO_MAX_LENGTH` export 추가(camera가 소비 — 기존 camera→round-ops 방향과 동일) |
| `camera/composables/useKillshotSubmit.ts` (신규) | Blob → 다운스케일 데이터 URL 변환 + `submitKillshot` 호출 + `isSubmitting`/에러 상태. 성공 시 콜백 |
| `camera/CameraPage.vue` | `제출 준비 중`(disabled) → **`킬샷 제출`**(accent, loading 지원). 성공 시 토스트 + `clear()`로 뷰파인더 복귀. 이번 라운드 미배정이면 disabled 유지 + 안내 |
| `firestore.rules` | §2.3 |
| `docs/qa/camera-cockpit.md` | 갱신 불필요(별도 QA 문서는 qa-tc 스킬 몫) |

### 삭제 없음

## 4. UI 상세 (디자인 시스템 준수)

공통: 시맨틱 유틸리티만, 카드 `BaseCard`, 여백은 컨테이너 `gap-*`(4px 그리드 정수 단계), 터치 타겟 48px+, 색+라벨 병기(그룹 색은 항상 한글 라벨 동반 — `armbandStyles.ts` 헬퍼 경유).

### 4.1 킬샷 확인 화면 (참가자, 다크 HUD)

- 사진 미리보기(기존 유지) + 2열 버튼: `다시 찍기`(neutral) / **`킬샷 제출`**(accent, `loading`=제출 중).
- 제출 성공: 토스트(`success`) "킬샷을 제출했어요 · 호스트 판정을 기다려 주세요" → 사진 clear → 뷰파인더 복귀(연속 촬영 허용).
- 실패: 토스트(`danger`) "제출에 실패했어요. 다시 시도해 주세요", 확인 화면 유지(사진 보존).
- 이번 라운드 미배정(`me` 없음/미배정): 제출 버튼 disabled + `text-caption` 안내.

### 4.2 판정 탭 (호스트)

- 헤더: `BaseSectionHeader title="판정"` + aside `BaseBadge`(`대기 N건`, N>0이면 `warning`, 0이면 `neutral`).
- 큐 카드(버튼): 좌측 64px 정사각 썸네일(`rounded-md object-cover`) + 제출자 행(`PlayerChip` 대신 완장 배지 + 이름 — 칩은 성별 필요라 과함) + `text-caption` 상대 시각. 오래된 것부터(`createdAt asc`).
- 빈 상태: `BaseCard` 안 `text-body text-content-secondary` "판정 대기 중인 킬샷이 없어요".
- 판정 시트(`BaseBottomSheet`): 사진 풀폭(`rounded-lg`) → 제출 정보 행 → **대상 팀 선택** — 그룹 색 섹션(파랑/주황/초록/빨강, 배정 팀이 있는 그룹만) 아래 팀 행 버튼(완장 알파벳 + 그룹 라벨 + 팀원 이름, `aria-pressed`, 제출자 본인 팀은 disabled) → 하단 2버튼: **`판정 확정`**(primary, 대상 미선택 시 disabled) / **`반려`**(danger). 반려는 사유 없이 즉시.
- 판정 완료 시: 토스트 + 시트 닫힘. 큐는 `status=='pending'` 구독이라 자동 제거.

## 5. 가드·엣지 케이스

1. 판정 대상 팀 목록은 `isAssignedInRound` 필터 필수(완장은 라운드 넘어 잔존).
2. 두 기기 동시 판정/이미 판정된 문서: rules가 `pending → *` 단방향만 허용 → 실패 시 에러 토스트 + 스냅샷이 큐에서 자연 제거.
3. 압축 후에도 상한 초과(비정상 캡처): 제출 중단 + 실패 토스트.
4. 라운드 일시정지 중 제출: 허용(rules는 `playing`만 요구). 판정도 동일.
5. 게임 종료(`playing→waiting`): 기존 가드가 각자 화면을 이탈시킴 — 구독은 leave에서 해제.
6. 오프라인: 액션 실패 토스트, SDK 오프라인 큐 그대로 활용(기존 정책).

## 6. 테스트 계획 (`__tests__/` 콜로케이션)

| 대상 | 케이스 |
|---|---|
| `api/submissions.ts` | 제출 payload(uid/team/round/status/serverTimestamp), 판정 approve/reject payload, pending 구독 쿼리 구성, **rules 문자열 대조**(900000·status 리스트·submissions match 존재) |
| `useKillshotSubmit` | 다운스케일·품질 재시도 루프(캔버스 mock), 상한 초과 시 실패, 제출 중 중복 호출 가드 |
| `useRoundOpsStore` | 4번째 구독 연결/해제, judge 액션 성공/실패, 비호스트 가드 |
| `JudgeQueueList`/`JudgeSheet` | 빈 상태, N건 배지, 그룹 섹션·팀 필터(isAssignedInRound), 확정 disabled 로직, 반려 흐름 |
| `CameraPage` | 제출 버튼 활성/로딩/성공 후 clear, 미배정 disabled, 기존 회귀(F-01 대체 — 이제 쓰기 발생) |

## 7. Definition of Done

1. `npm run type-check` + `npm run lint` + `npm run test:unit` 전부 통과.
2. firestore.rules는 앱과 함께 배포(PR 본문 명기).
3. 사용자 검증 전 커밋 금지(메모리 규칙).

## 8. 범위 제외 (명시)

- 판정 결과의 생존/탈락 반영, 생존 팀 수 갱신(콕핏 `N팀 생존`은 기존 파생값 유지)
- 참가자 측 판정 결과 수신 UI(승인/반려 알림)
- 기록 탭(판정 이력 열람) — mock 유지
- 판정 취소/재판정
