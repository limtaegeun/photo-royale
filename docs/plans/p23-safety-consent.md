# P23 안전 동의 화면 — 준비 완료 전에 안전 수칙 동의를 받는다

- **작성일**: 2026-11-15 (사용자 요구: 노션 기획 "① 안전 동의 화면" 이미지를 주고 "이 내용을 기반으로 개선해서 결과물 아티팩트로 보고해. ui 수정해도 좋음" → 결과 보고 뒤 "이렇게 머지하고 배포까지 진행해")
- **기준 코드**: main `d844767`
- **결과 보고**: https://claude.ai/artifact/EbV9TBFSqLYVuhvH5uswq4
- **상태**: 완료 — #135 머지(`6cf1348`), 2026-11-15 rules 배포 → hosting 배포

## 0. 한 줄 요약

대기실(P02)에서 준비 완료를 누르면 안전 동의 시트가 먼저 뜬다. 체크해야 "동의하고 준비 완료"가 눌리고, 동의 시각을 서버 시각으로 남긴다. 같은 날 다음 라운드에는 다시 묻지 않는다. 진행자는 대기실에서 "N명 중 M명 동의"와 명단을 본다. rules를 먼저 배포하고 hosting을 배포한다.

## 1. 문제

1. 지금까지 안전 수칙은 대기실 카드에 문장 몇 줄로만 있었다. 읽었는지 확인하는 단계가 없어서 준비 완료는 수칙을 보지 않고도 눌렸다.
2. 기획서는 준비 완료 앞에 동의를 두고, 동의 없이는 준비할 수 없게 한다. 책임 안내("게임 중 발생한 안전사고에 대한 책임은 본인에게 있습니다")도 동의 대상에 들어간다.
3. 누가 언제 동의했는지 남는 곳이 없었다.

## 2. 결정 (기획서 개발 메모)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 버튼 | 체크 전에는 "동의하고 준비 완료"를 비활성으로 둔다 | 기획서 개발 메모 |
| 2 | 동의 기록 | 참가자 문서에 `safetyConsentAt`(서버 시각)을 준비와 같은 쓰기로 남긴다 | 기획서 "참가자별 동의 시각 기록". 기기 시계는 믿지 않는다 |
| 3 | 다시 묻기 | 같은 날(서버 시각 기준 기기 달력 날짜) 동의가 있으면 다음 라운드에는 묻지 않는다. 늦게 들어온 사람은 첫 준비 때 본다 | 기획서 개발 메모 |
| 4 | 진행자 확인 | 대기실 카드에 "N명 중 M명 동의" 행과 명단 시트(미동의 먼저, 동의는 시각 순) | 기획서 "H01·H02에서 동의 여부 확인 가능하면 좋음" |
| 5 | 버튼 문구 | 게스트 준비 바는 기획서대로 "준비 완료"(배정 화면은 "라운드 준비 완료") | 동의 시트가 버튼 뒤에 붙으므로 문구에 "안전 수칙"을 넣지 않는다 |
| 6 | 다시 보기 | 대기실 "안전 수칙" 행의 보기 버튼. 동의 전·준비 전이면 같은 동의 시트, 그 밖에는 읽기 전용("오늘 HH:MM에 동의했어요") | 동의를 건너뛰는 길을 만들지 않는다 |
| 7 | rules | 준비 쓰기에 `safetyConsentAt`을 허용하되 `request.time`만 받는다. 필수로 걸지는 않는다 | 필수로 걸면 rules를 먼저 배포하는 동안 옛 앱의 준비가 전부 막힌다. 같은 날 두 번째 준비도 `isReady`만 쓴다 |

## 3. 변경

- `firestore.rules`: 참가자 준비 갈래에 `safetyConsentAt` 허용(서버 시각만)
- `src/features/waiting-room/api/rooms.ts`: `Participant.safetyConsentAt`, `setReady(code, uid, { withSafetyConsent })`. 구독은 `serverTimestamps: 'estimate'`로 지연 보상 중에도 동의 시각을 읽는다
- `src/features/waiting-room/safetyConsent.ts`: 수칙 4개 데이터와 같은 날 판정(`isSafetyConsentValid`)
- `src/features/waiting-room/stores/useWaitingRoomStore.ts`: `needsSafetyConsent`, `confirmReady`는 오늘 동의가 없으면 동의 없이 준비하지 않는다
- `src/features/waiting-room/components/SafetyConsentSheet.vue`: 동의·읽기 두 모드의 바텀시트
- `src/features/waiting-room/components/SafetyConsentRosterSheet.vue`: 진행자 동의 명단
- `src/features/waiting-room/WaitingRoomPage.vue`: 준비 바와 동의 시트 연결, 게스트 "안전 수칙" 행, 진행자 동의 현황 행
- `src/shared/components/BaseCheckbox.vue`: Reka Checkbox 기반 공용 체크박스(행 전체가 라벨, 48px)
- `src/shared/utils/formatClock.ts`: 콕핏의 판정 시각 포맷을 대기실도 쓰게 되어 shared로 올렸다

## 4. 검증

- 정적: type-check, lint, vitest 99파일 1354건 통과
- rules: 이 브랜치 rules를 올린 에뮬레이터에서 서버 시각 동의+준비 허용, 기기 시각 동의 거부, 동의 시각만(준비 없이) 거부, 준비만 허용. 배포 중인 rules(main)에서는 새 앱의 동의 쓰기가 거부됨을 확인했다 — rules를 먼저 배포해야 한다
- 화면: 에뮬레이터에 붙인 개발 서버에서 게스트·진행자를 따로 로그인해 확인했다
  - 준비 완료를 누르면 시트가 뜨고, 체크 전에는 버튼이 비활성이다. 라벨 글자를 눌러도 체크된다
  - 동의하면 준비가 되고 "오늘 HH:MM에 동의했어요"가 보인다. 보기는 읽기 모드로 열린다
  - 같은 날 다음 라운드(준비 리셋 뒤)는 시트 없이 바로 준비된다
  - 진행자 대기실에 "8명 중 6명 동의" 행과 명단 시트가 보인다
  - 작은 폰에서 시트가 열릴 때 자동 포커스로 내용이 내려가지 않는다
- 배포 뒤 확인: rules를 먼저 올리고 hosting을 올렸다. 배포본 `index-CO5tQwns.js` 가 머지 커밋 빌드와 같고 "동의하고 준비 완료" 문구가 들어 있다. 실서버에 방을 만들어 누르지는 않았다

## 5. 남은 일

- [x] 커밋·PR·머지 — #135, 2026-11-15
- [x] rules 배포 → hosting 배포 — 2026-11-15
- [ ] 실기기에서 시트 길이와 체크 감각 확인
