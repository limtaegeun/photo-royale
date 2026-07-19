# photo-royale 디자인 시스템 (PRDS)

토스 TDS·Material Design 3·GitHub Primer·Shopify Polaris·Atlassian DS의 공개 방법론을 조사해, 이 프로젝트(야외 공원에서 뛰며 조작하는 모바일 게임 PWA)에 맞게 축소·적용한 시스템이다.

**구현 방식**: 3계층 CSS custom properties(`--pr-*`)가 **단일 진실원**이고, **Tailwind v4가 그 시맨틱 토큰을 얇게 소비**한다(`@theme inline`). 즉 색·타이포·radius의 값은 전부 `--pr-*` 토큰에 있고, Tailwind는 `bg-canvas`/`text-content`/`text-body` 같은 유틸리티를 그 토큰을 참조해 생성만 한다. Tailwind는 devDependency이며 런타임 의존성(vue/pinia/vue-router 3개)은 늘지 않는다.

## 1. 채택한 방법론과 근거

| 결정 | 채택 원천 | 근거 |
|---|---|---|
| 토큰 3계층: primitive → semantic → component | TDS(Base/Semantic/Component), M3(ref/sys/comp), Primer(base/functional/component) | 테마 전환·리브랜딩 시 semantic 계층만 바꾸면 컴포넌트 무수정 |
| **컴포넌트는 semantic만 참조, primitive 직접 참조 금지** | Primer / M3 공통 원칙 | 다크↔라이트 자동 전환의 전제 조건 |
| 시맨틱 네이밍 `{target}-{role}-{variant}` (target = bg/text/border/fill) | TDS 컬러 시스템(Target+Role+Variant 조합) | grep 한 번에 용도 파악 가능 |
| 색상 스케일 50~950, 모든 색상군 동일 명도 진행 | TDS 2024 컬러 개편(OKLCH 기반 "같은 스케일=같은 명도") | 스케일 번호만 보고 대비 예측 가능 |
| **다크 퍼스트 + 다크는 라이트보다 더 강한 대비** | TDS(APCA 참고, 라이트/다크 별도 명도 계단) | 카메라 콕핏 HUD가 코어 화면 |
| 타이포 역할 기반(display~caption) + TDS Typography 1~7 수치 | M3(역할 기반이 업계 주류) + TDS Mobile(30/26/22/20/17/15/13px) | 크기 기반 네이밍은 오남용 유발 |
| 텍스트 크기 rem 단위(고정 px 금지) | TDS 접근성 원칙(OS 큰 텍스트 대응) | 야외에서 텍스트 확대 사용자 배려 |
| 스페이싱 4px 배수, 번호 = 4px 배수 ×100 (`space-400` = 16px) | Polaris(4px), M3(4dp 최소 단위) | 계산 없이 이름에서 값 역산 |
| 대비 기준: 본문 AA(4.5:1) 하한, 핵심 텍스트 AAA(7:1) 목표 | WCAG 2.1 SC 1.4.3 + 자체 상향 | 야외 주간 고휘도 특화 지침은 어느 대기업 DS에도 없음 → 자체 상향 설계 |
| 디자인 시스템은 통제가 아닌 제품(수요자 요구 우선) | TDS "가드레일 vs 울타리" | 시스템이 화면 요구를 못 맞추면 시스템을 고친다 |

출처: [TDS 컬러 시스템 업데이트](https://toss.tech/article/tds-color-system-update) · [TDS Mobile Typography](https://tossmini-docs.toss.im/tds-mobile/foundation/typography) · [디자인 시스템 다시 생각해보기](https://toss.tech/article/rethinking-design-system) · [M3 Design tokens](https://m3.material.io/foundations/design-tokens/overview) · [Primer token names](https://primer.style/product/primitives/token-names/) · [Polaris space tokens](https://polaris-react.shopify.com/tokens/space) · [WCAG SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

## 2. 파일 구조

```
src/shared/styles/
  index.css              # 엔트리 (main.ts에서 import): Tailwind + 토큰 로드 + @theme inline 매핑
  tokens.primitive.css   # Layer 1: 원시값 (--pr-gray-500, --pr-space-400 …)
  tokens.semantic.css    # Layer 2: 역할 토큰 + 테마 오버라이드 (--pr-color-text-primary …)
  base.css               # 전역 최소 규칙 (body 기본, reduced-motion 등 — preflight가 못 덮는 것만)
src/shared/components/
  Base*.vue              # Layer 3: 컴포넌트 (Tailwind 시맨틱 유틸리티로 소비)
```

모든 토큰은 `--pr-` 접두사(photo-royale 네임스페이스)를 쓴다. `index.css`의 `@theme inline`이 이 토큰들을 Tailwind 유틸리티로 노출하며, `--color-*: initial`로 Tailwind 기본 팔레트를 꺼서 **프로젝트 시맨틱 유틸리티만** 존재한다.

## 3. 절대 규칙 (위반 시 리뷰 반려)

1. **primitive 직접 참조 금지.** 템플릿에서는 시맨틱 유틸리티(`bg-canvas`, `text-content`, `bg-brand` …)만 쓴다. `--color-*: initial` 덕분에 `bg-red-500` 같은 primitive성 유틸리티는 **존재하지 않아** 컴파일 단위에서 강제된다. 스코프 CSS가 꼭 필요하면 `--pr-color-*` semantic 토큰만 참조하고 `--pr-gray-*` 등 원시값은 금지. 필요한 시맨틱 토큰이 없으면 `tokens.semantic.css`에 추가 → `index.css` `@theme`에 유틸리티로 노출하는 것이 정답이다.
2. **hex 하드코딩·arbitrary 색값 금지.** `bg-[#123456]` 같은 arbitrary value도 금지(리뷰에서 `grep '\[#'`로 검출). 새 색은 primitive 스케일 추가 → semantic 노출 → `@theme` 매핑 → 유틸리티 사용.
3. **텍스트 크기 px 하드코딩 금지.** 역할 유틸리티(`text-display`/`text-title`/`text-heading`/`text-subheading`/`text-body`/`text-label`/`text-caption`) 사용 — 크기·행간·굵기가 세트로 적용된다.
4. **스페이싱·radius 매직넘버 금지.** 스페이싱은 Tailwind 기본 4px 그리드(`p-4`=16px, `gap-2`=8px …), radius는 `rounded-sm/md/lg/xl/full`.
5. **터치 타겟**: 인터랙티브 요소는 최소 48px(`h-(--pr-size-control-md)` 이상)을 확보한다. 시각적 크기가 더 작아야 하면 히트 영역을 pseudo-element로 확장한다.
6. **색만으로 의미 전달 금지**: 팀·상태는 항상 텍스트/아이콘 라벨을 병기한다(색약 대응 — 완장 알파벳이 게임 코어인 이유와 동일).
7. **새 대비 조합을 만들면 검증한다**: WCAG 대비비 계산으로 텍스트 4.5:1(핵심 7:1), 비텍스트 3:1 확인. 현재 토큰 조합은 전부 수치 검증 완료.

### 스타일 작성 경계 (Tailwind vs scoped CSS)
- **기본은 템플릿의 Tailwind 유틸리티.** 레이아웃·간격·색·타이포는 유틸리티로 쓴다.
- **scoped `<style>`는 예외적으로만**: 복잡한 상태 조합, `::before`/애니메이션 keyframes 등 유틸리티로 표현이 어려운 경우. 이때도 값은 `--pr-*` 토큰 참조.
- 동적 클래스는 **완전한 리터럴 문자열 맵**으로 작성한다(`bg-team-${t}` 같은 문자열 조합 금지 — Tailwind 스캐너가 인식 못 해 유틸리티가 생성되지 않는다). `BaseButton.vue`/`BaseBadge.vue`의 `*_CLASS` 맵이 표준 예시.

## 4. 테마 전략 (다크 퍼스트)

- `:root` = **다크 HUD 테마가 기본**. 카메라 콕핏(P04) 등 게임 코어 화면 기준.
- 대기실·라운드결과·호스트 관리 등 비카메라 화면은 해당 화면 루트에 `data-theme="light"`를 달아 라이트로 전환한다.
- 테마 전환은 semantic 계층 오버라이드만으로 동작하므로 컴포넌트는 테마를 몰라도 된다.
- 카메라 프리뷰 위 HUD는 `bg-scrim`(필요시 `bg-scrim-weak`/`bg-scrim-strong`)을 배경으로 깐 뒤 그 위에 텍스트를 올린다(영상 위 직접 텍스트 금지 — 대비 보장 불가).
- 사망 블랙아웃은 `bg-blackout`.

## 5. 유틸리티 레퍼런스 (템플릿에서 타이핑하는 이름)

> 핵심 규칙: **색 이름의 기본값은 "읽기용 텍스트 색"**이다. 채운 배경은 `-solid`를 붙인다(예: 인라인 에러 텍스트 `text-danger`, 위험 버튼 배경 `bg-danger-solid`). brand/neutral은 텍스트/배경 값이 같아 `-solid`가 없다.

### 컬러
| 그룹 | 유틸리티 | 대응 토큰 / 용도 |
|---|---|---|
| 배경(서피스) | `bg-canvas` / `bg-elevated` / `bg-surface` / `bg-surface-strong` | 화면 → 카드 → 중첩 서피스 |
| 스크림·블랙아웃 | `bg-scrim-weak` / `bg-scrim` / `bg-scrim-strong` / `bg-blackout` | 카메라 HUD 오버레이, 사망 |
| 텍스트 | `text-content` / `-content-secondary` / `-content-tertiary` / `-content-disabled` | 위계 순 |
| 보더 | `border-stroke` / `border-stroke-strong` | (`border` 폭과 함께 사용) |
| 인터랙티브 fill | `bg-brand`(코발트, 주 CTA·+`-pressed`) / `bg-accent`(라임, 보조 강조·+`-pressed`) / `bg-neutral`(+`-pressed`) / `bg-disabled` | 버튼 배경 |
| 상태 텍스트 | `text-success` / `text-warning` / `text-danger` / `text-info` | 인라인 메시지 (캔버스 위 AA 보장) |
| 상태 solid | `bg-success-solid` / `bg-warning-solid` / `bg-danger-solid`(+`-pressed`) / `bg-info-solid` | 채운 배경 |
| 채운 면 라벨 | `text-on-brand` / `text-on-accent` / `text-on-danger` / `text-on-success` / `text-on-warning` / `text-on-info` | 위 solid/brand/accent 배경 위 텍스트 |
| 팀 텍스트 | `text-team-{red,blue,green,orange}` | 인라인 팀 표기 |
| 팀 solid | `bg-team-{red,blue,green,orange}-solid` | 뱃지·완장 표식 |
| 팀 라벨 | `text-on-team-{red,blue,green,orange}` | 팀 solid 배경 위 텍스트 (반드시 짝 사용) |
| 성별 텍스트 | `text-gender-{male,female}` | 참가자 성별 표기(남 파랑·여 빨강) — 팀과 값은 같아도 의미가 달라 별도 시맨틱. 색+접근성 라벨 병기 필수 |

### 타이포그래피 (역할 유틸리티 — 크기·행간·굵기 세트)
| 유틸리티 | 크기/굵기 | 용도 |
|---|---|---|
| `text-hero` | 46px/800 | 진입 화면 워드마크(PHOTO ROYALE) 등 초대형 |
| `text-display` | 30px/800 | 카운트다운, 라운드 타이틀 |
| `text-title` | 26px/700 | 화면 타이틀 |
| `text-heading` | 22px/700 | 섹션 헤딩 |
| `text-subheading` | 20px/600 | 카드 타이틀, 리스트 헤더 |
| `text-body` | 17px/400 | 표준 본문 (야외 가독 기준으로 통상 16px보다 큼) |
| `text-label` | 15px/600 | 버튼, 뱃지, 입력 라벨 |
| `text-caption` | 13px/400 | 타임스탬프, 보조 설명 (최소 크기 — 이보다 작게 금지) |

### 스페이싱·radius·기타
- 스페이싱: Tailwind 기본 4px 그리드 그대로 — `p-1`=4px, `p-2`=8px, `p-4`=16px, `p-5`=20px, `p-6`=24px, `gap-*`/`m-*` 동일.
- radius: `rounded-sm`(6) / `rounded-md`(10) / `rounded-lg`(16) / `rounded-xl`(24) / `rounded-full`.
- 컨트롤 높이(터치 타겟): `h-(--pr-size-control-sm)`=36 / `-md`=48 / `-lg`=56.
- 모션: `duration-100`(fast)/`duration-200`(base)/`duration-300`(slow) + `ease-standard`/`ease-decelerate`.
- z-index는 `--pr-z-*` 토큰(스코프 CSS에서 사용). 하단 safe-area는 `--pr-inset-bottom-safe`.

> `--pr-*` 원본 토큰 전체 정의는 `src/shared/styles/tokens.{primitive,semantic}.css`, 유틸리티 매핑은 `index.css`의 `@theme inline` 참조.

사용: `font-size: var(--pr-font-body-size); font-weight: var(--pr-font-body-weight);`

### 스페이싱 / 기타
- `--pr-space-{0,050,100,150,200,300,400,500,600,800,1000,1200,1600}` = 0~64px (번호÷100×4px)
- `--pr-radius-{sm,md,lg,xl,full}` = 6/10/16/24/999px
- `--pr-size-control-{sm,md,lg}` = 36/48/56px, `--pr-size-tap-minimum` = 48px
- `--pr-inset-bottom-safe` = 하단 safe-area (하단 고정 바 필수 적용)
- `--pr-z-{base,hud,sheet,modal,toast}` = 0/100/200/300/400
- `--pr-duration-{fast,base,slow}` + `--pr-easing-{standard,decelerate}`

## 6. 컴포넌트 계층

- 공용 컴포넌트는 `src/shared/components/Base*.vue` (CLAUDE.md 네이밍 규칙).
- **재사용 가능성이 있는 UI 요소는 생 HTML 태그로 화면에 직접 두지 않고 `Base*` 컴포넌트로 만들어 재사용한다.** (input·버튼·뱃지 등 원자 단위. 생 `<input>`/`<button>` 직접 마크업 금지 → 해당 `Base*` 사용.)
- 컴포넌트 문서화 순서는 TDS 가이드 규칙을 따른다: 타입 → 영역 → 상세 스펙 → 접근성 → 큰 텍스트 → 다크모드.

### 6.1 Headless 기반 (Reka UI)

**Base 컴포넌트는 [Reka UI](https://reka-ui.com/)(headless, unstyled) 위에 만든다.** 접근성·상호작용 행동은 Reka primitive에 위임하고, 스타일은 이 문서의 시맨틱 유틸리티로만 작성한다. Reka는 `data-state`/`data-*` 속성을 스타일 훅으로 노출하므로(`data-[state=checked]:bg-brand`) 프로젝트의 `data-*` 스타일 훅 패턴과 그대로 맞물린다.

- **원자(비행동형)** — Reka `Primitive`(`as`/`as-child`)로 렌더해 다형·합성(예: `DialogTrigger as-child`)을 얻는다:
  `BaseButton`(`as="button"`), `BaseBadge`(`as="span"`), `BaseInput`(`as="input"`, Reka에 전용 Input primitive 없음 → 이미 접근성 확보된 네이티브 input을 Primitive로 렌더).
- **행동형** — 전용 primitive를 쓴다(a11y가 무거워 headless의 실익이 큰 지점):
  - `BaseSegmented` — `RadioGroup`(화살표키 네비·roving tabindex).
  - `BaseDialog` — `Dialog` 중앙 모달(focus trap·scroll lock·Escape/backdrop dismiss·포털).
  - `BaseBottomSheet` — `Dialog` 하단 시트(모바일 코어, safe-area·슬라이드업).
  - `BaseToast` + `useToast`(`shared/composables`) + `BaseToastProvider` — `Toast`(ARIA live region·타이머·스와이프 dismiss). Provider는 `App.vue`에 1회 마운트하고, 발행은 어느 기능에서든 `useToast().toast({ title, tone })`.
- 진입/이탈 애니메이션은 Reka `Presence`가 `data-state=closed`에서 애니메이션 종료까지 언마운트를 지연하므로, scoped `<style>`의 `@keyframes`로 작성하되 값은 `--pr-duration-*`/`--pr-easing-*` 토큰만 참조한다(`prefers-reduced-motion` 대응 포함).
- 성장 예정 후보(**실제 두 번째 사용처가 생길 때 추가** — shared 승격 규칙과 동일): BottomCta(하단 고정 CTA), ListRow, LifeGauge.

## 7. 미확정/후속 과제

- **정확한 브랜드 hex는 v0 잠정값**이다. 와이어프레임 무드(Deep Navy + Cobalt + Lime)를 따르되 hex 준수 의무 없음이 확인된 상태로, 디자이너 확정 시 primitive 계층만 교체하면 된다.
- Pretendard 웹폰트는 아직 미포함(현재 시스템 폰트 폴백). 도입 시 성능 예산 검토 후 self-host.
- 팀 4색의 색약 시뮬레이션 검증(적록 색약에서 red vs orange 구별)은 라벨 병기 규칙으로 완화했으나, 디자이너 확정 팔레트에서 재검증 필요.
