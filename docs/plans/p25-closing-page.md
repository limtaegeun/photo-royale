# P25 마무리 페이지 — 마지막 라운드 뒤 참가자 전원에게 한 번 뜨는 인사

- **작성일**: 2026-11-15 (사용자 요구: 노션 기획 "③ 마무리 페이지 화면"을 주고 "이 내용대로 진행하면 되고, ui 수정 디자인 수정 페이지 추가 너 판단하에 진행. 여러 가지 좋은 ui 제시해서 아티팩트 보고" → 시안 B(엔딩 크레딧)에 C(셔터 태그 버튼)를 섞고 "내 방 열어보기"는 맨 끝에 고정 없이 → "배포까지 진행해")
- **기준 코드**: main `263e10b`
- **결과 보고**: https://claude.ai/artifact/Qemid3aHfiNN3paW9En6hQ
- **상태**: 완료 — #139 머지(`e996a8a`), 2026-11-15 rules 배포 → hosting 배포

## 0. 한 줄 요약

진행자가 대기실(P02)에서 "게임 마무리"를 누르면 참가자 전원의 화면에 마무리 페이지(`/closing/:roomCode`)가 기기마다 한 번 뜬다. 기획서 문구를 엔딩 크레딧처럼 가운데 정렬로 올리고, 셔터 모양 버튼으로 "#포토로얄 @photoroyales"를 복사한 뒤 인스타그램 계정을 연다. rules를 먼저 배포하고 hosting을 배포한다.

## 1. 문제

1. 기획서는 "마지막 라운드 결과(P10) 이후 1회 노출"이라고만 적었다. 앱에는 게임 전체가 끝났다는 신호가 없다 — 라운드 종료와 게임 종료가 같은 쓰기(playing → waiting)라 참가자 기기는 마지막 라운드를 구별하지 못한다.
2. 인사·친구들과 하기·이용 요금·인스타 태그를 보여 줄 화면이 없었다.

## 2. 결정

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 뜨는 시점 | 진행자 대기실 순위 카드 아래 "게임 마무리" 행 → 확인 다이얼로그 → 방 문서 `closedAt`(서버 시각) | 마지막 라운드는 진행자만 안다. 정산한 라운드가 하나 이상이고 대기 중일 때만 보인다 |
| 2 | 한 번만 | 기기마다 `localStorage` `pr:closing-shown:<방>:<closedAtMs>`로 본 시각을 남긴다. 다시 마무리하면 새 시각이라 한 번 더 뜬다 | "대기실로 돌아가기"로 순위를 다시 봐도 또 뜨지 않게 |
| 3 | 화면 | 시안 E — 가운데 정렬 크레딧, 셔터 태그 버튼, "내 방 열어보기"+요금은 맨 끝(하단 고정 아님) | 사용자 선택. 시안 A~D는 결과 보고에서 비교 뒤 뺐다 |
| 4 | 셔터 | 카메라 콕핏 셔터와 같은 `BaseButton variant="shutter"`, 손잡이만 라임 "@". 버튼 이름은 아래 태그 문구(aria-labelledby) | 셔터가 "사진 찍기"로 읽히지 않게 바로 아래에 동작을 적는다 |
| 5 | 내 방 열어보기 | 주소가 정해지기 전까지 입장 화면(`entry`)으로 보낸다 | 누르자마자 방을 만들면 둘러보려던 사람의 "내가 만든 방"에 빈 방이 쌓인다 |
| 6 | 로고·배경 안내 | 뺀다 | 기획서 개발 메모 — 기능이 들어간 뒤 붙인다 |
| 7 | 인스타 열기 | iOS·기타: `instagram://user?username=photoroyales` → 1.5초 안에 화면이 숨겨지지 않으면 웹 프로필. 안드로이드: 같은 주소를 `intent://…;S.browser_fallback_url=…` 로 감싼다 | 안드는 앱이 1.4초에 떠도 크롬이 숨김으로 바꾸는 건 2.9초라 타이머가 뒤 탭을 웹으로 넘겼다. iOS도 앱을 열면 뒤 탭이 웹으로 가지만 사용자 결정으로 둔다("앱이 깔려 있으면 앱으로 넘어가기만 하면 됨") |
| 8 | 카메라 | 마무리 페이지는 `meta.releaseCamera`로 같은 방이어도 카메라를 놓는다 | P24는 같은 방 코드 화면 사이에서 카메라를 쥔다. 게임이 끝난 화면에서 카메라가 켜진 채 남았다 |
| 9 | 추가 문구 | 맨 위 "오늘의 플레이어 · 여러분 모두"(크레딧 연출), 셔터 아래 동작 안내 | 기획서에 없다 — 기획 확인 대상 |

## 3. 변경

- `firestore.rules`: 방 업데이트 6번 갈래 — 대기 중인 방의 호스트가 `closedAt` 하나만 `request.time`으로 쓴다
- `src/features/waiting-room/api/rooms.ts`: `RoomInfo.closedAtMs`, `closeGame(code)`
- `src/features/waiting-room/stores/useWaitingRoomStore.ts`: `canCloseGame`, `closedAtMs`, `wrapUpGame()`
- `src/features/waiting-room/closingShownMarker.ts`: 기기별 본 마무리 기록
- `src/features/waiting-room/WaitingRoomPage.vue`: "게임 마무리" 행·확인 다이얼로그, `closedAt`을 보면 마무리 페이지로 이동
- `src/features/closing/`: `ClosingPage.vue`, `useInstagramTag.ts`(복사·안내·앱/웹 열기)
- `src/router/index.ts`: `/closing/:roomCode`(인증 없음, 헤더 없음, `releaseCamera`)
- `src/features/camera/composables/useCameraRoomGuard.ts`: `meta.releaseCamera`면 같은 방이어도 끈다
- `src/shared/components/BaseToast.vue`: 토스트 문구 어절 단위 줄바꿈(`break-keep`)

## 4. 검증

- 정적: type-check, lint, vitest 103파일 1395건 통과. `firebase deploy --only firestore:rules --dry-run` 컴파일 통과
- rules: 이 브랜치 rules를 올린 에뮬레이터에서 8건이 기대대로 나왔다
  - 허용: 호스트·대기 중·서버 시각, 다시 마무리, 마무리한 방에서 게임 시작(1번 갈래)
  - 거부: 참가자, 비로그인, 기기 시각, 진행 중인 방, 다른 키와 함께
  - 배포 중인 rules(main)에서는 새 앱의 마무리 쓰기가 거부된다 — rules를 먼저 배포해야 한다
- 화면: 로컬 개발 서버 390×844에서 가로 넘침 없음. 셔터 80px, 버튼 56·48px. 셔터를 누르면 클립보드에 "#포토로얄 @photoroyales"가 들어간다
- 인스타 열기: 시뮬레이터에 인스타를 깔 수 없어 `instagram` 스킴을 받는 가짜 앱을 만들어 쟀다
  - iOS 사파리 27.2(iPhone 17 시뮬): 앱 없음 → "주소가 유효하지 않음" 오류창이 약 3초 뜬 뒤 웹 프로필. 앱 있음 → "'Instagram'에서 열겠습니까?" → 열기 → 앱이 `instagram://user?username=photoroyales`로 열린다(뒤 탭은 웹으로 간다)
  - 안드 크롬 145(API 37 에뮬): 앱 없음 → 1.9초에 웹 프로필. 앱 있음 → 앱만 열리고 탭은 마무리 페이지 그대로
- 배포 뒤 확인: rules를 먼저 올리고 hosting을 올렸다. 배포본 `index-C3UAZdzf.js` 가 머지 커밋 빌드와 같고 마무리 문구·`intent://`·`closedAt` 이 들어 있다. 배포 주소 `/closing/AB2C` 를 390×844로 열어 제목·셔터가 보이고 가로 넘침·스크립트 오류가 없음을 확인했다. 실서버에 방을 만들어 마무리를 누르지는 않았다
- 안 한 것: 실서버·에뮬레이터에서 진행자가 마무리를 눌러 참가자 화면이 넘어가는 흐름(단위 테스트 6건으로 확인), 실기기 인스타 앱

## 5. 남은 일

- [x] 커밋·PR·머지 — #139, 2026-11-15
- [x] rules 배포 → hosting 배포 — 2026-11-15
- [ ] 기획 확인: "내 방 열어보기" 주소, 마무리 버튼 이름·자리, 크레딧 문구 유지 여부
- [ ] 실기기에서 인스타 앱 열기 확인
