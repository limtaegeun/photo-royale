# photo-royale

Vue 3 + Vite + TypeScript + Pinia + Vue Router SPA. (서비스 상세 스펙은 확정 시 이 문단에 1줄 추가)

**모바일 우선(Mobile-first)**: 이 앱은 기본적으로 모바일 환경에서 동작함을 전제로 개발한다. 레이아웃·터치 타겟·인터랙션은 모바일 세로 화면을 기본값으로 설계하고, 데스크톱은 그 위에 확장한다.

## 명령어

```bash
npm run dev          # 개발 서버
npm run type-check   # vue-tsc 타입 체크
npm run lint         # oxlint --fix → eslint --fix 순차 실행
npm run test:unit    # vitest (jsdom 환경)
npm run test:unit -- --run src/features/<기능>   # 특정 기능만 테스트
npm run build        # type-check + vite build 병렬
```

**Definition of Done**: 코드 변경 후 `type-check` + `lint` + `test:unit` 3개가 모두 통과해야 완료다. "될 것 같다"로 완료 선언 금지.

## 아키텍처: 경량 Feature-folder (수직 슬라이스)

한 기능의 모든 코드(UI, 상태, API, 테스트)는 그 기능의 폴더 하나에 콜로케이션한다.

```
src/
  main.ts / App.vue      # 앱 셸 (create-vue 기본 위치 유지)
  router/                # 라우트 테이블만. 비즈니스 로직 금지
  features/
    <기능명>/             # kebab-case, 예: photo-upload
      components/        # 이 기능 전용 컴포넌트
      composables/       # useXxx.ts
      stores/            # useXxxStore.ts (이 기능 전용 Pinia 스토어)
      api/               # 이 기능의 API 호출
      __tests__/         # 이 기능의 테스트
      index.ts           # 이 기능이 외부에 공개하는 것만 re-export
  shared/
    components/          # BaseButton.vue 등 Base 접두사 공용 UI
    composables/         # 2개 이상 기능에서 쓰는 것만
    stores/              # 여러 기능이 공유하는 전역 상태
    styles/              # 디자인 토큰(3계층 CSS variables) + 전역 base — docs/DESIGN_SYSTEM.md 참조
    utils/
    types/
```

path alias: `@` → `src/` (예: `@/features/photo-upload`)

### 배치 규칙

1. **새 코드는 무조건 `features/<기능>/` 안에** 만든다. 어느 기능인지 애매하면 더 구체적인 쪽을 선택한다.
2. **shared 승격 규칙**: 처음부터 `shared/`에 만들지 않는다. 두 번째 기능이 실제로 import하는 시점에 `shared/`로 옮긴다.
3. **기능 간 import는 상대경로 금지** — 반드시 상대 기능의 `index.ts`(public API)를 통해서만: `import { usePhotoUpload } from '@/features/photo-upload'`. 내부 파일 직접 import(`@/features/photo-upload/composables/...`) 금지.
4. **배럴(index.ts)은 기능 폴더당 1개만.** 하위 폴더(components/, composables/ 등)에 index.ts를 만들지 않는다 — Vite 트리셰이킹과 grep 추적성을 해친다.
5. **router/에는 라우트 정의만.** 가드 로직이 필요하면 해당 기능의 composable로 만들어 import한다.

### 네이밍 (에이전트 검색성 기준)

| 대상 | 규칙 | 예 |
|---|---|---|
| 컴포넌트 | PascalCase, 2단어 이상 | `PhotoUploader.vue` |
| 공용 기본 UI | `Base` 접두사 | `BaseButton.vue` |
| composable | `use` + camelCase, named export만 | `useAuth.ts` → `export function useAuth()` |
| Pinia 스토어 | `use<Name>Store`, 파일당 스토어 1개 | `usePhotoUploadStore.ts` |

`grep useXxx` 한 번에 정의가 정확히 1개 잡혀야 한다. 같은 이름의 composable/store를 두 곳에 만들지 않는다.

### 테스트

- 테스트는 소유 기능의 `__tests__/`에 콜로케이션. 최상위 `/tests` 디렉토리를 만들지 않는다.
- 컴포넌트는 `@vue/test-utils`의 `mount`로 렌더 결과를 검증하고, 스토어는 `createPinia()`를 setup에서 새로 만들어 격리한다.

## 디자인 시스템 (docs/DESIGN_SYSTEM.md)

토큰 3계층 `shared/styles/tokens.primitive.css` → `tokens.semantic.css`(`--pr-*`, 단일 진실원)를 **Tailwind v4가 `@theme inline`으로 소비**한다(`index.css`). 스타일은 템플릿의 **Tailwind 시맨틱 유틸리티**로 작성한다. 핵심 규칙:

1. **primitive 직접 참조 금지.** 유틸리티는 시맨틱만 존재한다(`index.css`의 `--color-*: initial`로 기본 팔레트를 꺼서 `bg-red-500`류가 아예 없음). 색은 `bg-canvas`/`text-content`/`bg-brand` 등, arbitrary 색값(`bg-[#...]`)도 금지. 필요한 시맨틱이 없으면 `tokens.semantic.css` 추가 → `index.css` `@theme`에 노출.
2. 텍스트 크기는 역할 유틸리티(`text-display`~`text-caption`), 스페이싱은 Tailwind 4px 그리드(`p-4`=16px), radius는 `rounded-md` 등. px/매직넘버 금지.
3. 기본 테마는 다크(카메라 HUD 기준). 라이트 화면은 루트에 `data-theme="light"` — 유틸리티는 그대로 두면 토큰 오버라이드로 자동 전환된다.
4. 인터랙티브 요소 최소 터치 타겟 48px(`h-(--pr-size-control-md)` 이상), 팀/상태는 색+라벨 병기.
5. 색 이름 기본값 = 읽기용 텍스트 색, 채운 배경은 `-solid`(`text-danger` vs `bg-danger-solid`). 동적 클래스는 리터럴 문자열 맵으로(스캐너 대응). 새 색 조합은 WCAG 대비(텍스트 4.5:1, 비텍스트 3:1) 검증 후 도입.

스타일 작성 경계·유틸리티 전체 레퍼런스는 `docs/DESIGN_SYSTEM.md` 참조.

## 하지 말 것 (→ 대신)

- 기술 유형별 최상위 폴더(`src/components/`, `src/services/`) 생성 금지 → 기능 폴더 안에 만들 것
- 컴포넌트 안에서 직접 `fetch` 호출 금지 → 해당 기능의 `api/`에 함수로 만들고 composable에서 호출
- default export 금지 (컴포넌트 .vue 제외) → named export
- 재사용 가능성 있는 UI 요소를 생 HTML 태그(`<input>`·`<button>` 등)로 화면에 직접 마크업 금지 → `shared/components/Base*.vue` 컴포넌트로 만들어 재사용 (원자 단위 UI는 DS 컴포넌트가 단일 진실원. 현재: `BaseButton`/`BaseBadge`/`BaseInput`/`BaseSegmented`, docs/DESIGN_SYSTEM.md §6)
- 라이브러리 추가 전 반드시 사용자에게 확인 → 현재 런타임 의존성은 vue/pinia/vue-router 3개뿐이며 이 상태를 유지하는 것이 기본값 (Tailwind v4는 빌드타임 devDependency라 런타임 의존성 아님)

## 알아둘 것

- lint는 oxlint가 먼저 돌고 eslint가 뒤에 돈다. oxlint가 잡은 규칙은 eslint에서 중복 보고되지 않는다(`eslint-plugin-oxlint`).
- 이 파일은 사람이 검수하며 유지한다. 구조 규칙을 바꾸는 작업을 했다면 이 파일도 같은 커밋에서 갱신할 것.
