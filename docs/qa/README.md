# docs/qa — QA Test Case 저장소

이 폴더는 기능별 QA test case(TC) 문서의 **저장소**다. 브랜치별 일회성 산출물이 아니라, 추후 전체 회귀 테스트 시 소스로 재사용된다.

## 파일 네이밍

파일명은 브랜치명이 아니라 **기능 기준 kebab-case**로 짓는다.

- ✅ `waiting-room.md`, `photo-upload.md`
- ❌ `feat-p02-waiting-room.md` — `feat`/`fix` 등 브랜치 타입 prefix, `p02` 같은 화면 번호 금지

같은 기능을 다시 작업할 때는 새 파일을 만들지 말고 **기존 기능 파일을 갱신**한다.

## 작성·활용 플로우

- 작성: `qa-tc` 스킬 — 브랜치 diff 전수 분석 기반으로 TC 도출
- 검증: `live-qa` 스킬 — 이 문서를 입력으로 실기기(브라우저) QA 진행
