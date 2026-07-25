<script setup lang="ts">
import { computed } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'

/**
 * Reka `Primitive` 기반 버튼. 기본은 <button>이지만 `as`/`as-child`로 다형 렌더가 가능하다.
 * (예: `<BaseButton as-child><RouterLink .../></BaseButton>` 또는 오버레이 트리거와 합성)
 */
interface Props extends PrimitiveProps {
  /** 버튼 역할별 색상 톤 (primary=브랜드 블루, accent=라임) */
  variant?: 'primary' | 'accent' | 'neutral' | 'danger' | 'ghost'
  /**
   * 버튼 크기 — md(48)/lg(56)는 시각 높이로 최소 터치 타겟을 충족한다.
   * sm(36)은 리스트 행 안의 인라인 액션용으로, 시각 높이는 낮추되 히트 영역은
   * ::before로 48px까지 확장해 터치 타겟 규칙을 지킨다(DESIGN_SYSTEM §3-5).
   */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 비동기 작업 진행 중 표기 — 라벨은 유지한 채 스피너만 겹쳐 보이고, disabled와 동일하게 클릭을 막는다 */
  loading?: boolean
  type?: 'button' | 'submit'
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  type: 'button',
})

/**
 * Tailwind 스캐너는 동적 문자열을 인식하지 못하므로 완전한 리터럴 클래스명으로 매핑한다.
 * 색은 시맨틱 유틸리티(bg-brand 등)만 사용 — primitive 유틸리티는 존재하지 않는다.
 */
const VARIANT_CLASS = {
  primary: 'bg-brand text-on-brand active:bg-brand-pressed',
  accent: 'bg-accent text-on-accent active:bg-accent-pressed',
  neutral: 'bg-neutral text-content active:bg-neutral-pressed',
  danger: 'bg-danger-solid text-on-danger active:bg-danger-solid-pressed',
  ghost: 'bg-transparent text-content border border-stroke-strong',
} as const

const SIZE_CLASS = {
  sm: 'h-(--pr-size-control-sm) text-label',
  md: 'h-(--pr-size-control-md) text-label',
  lg: 'h-(--pr-size-control-lg) text-body',
} as const

const buttonClass = computed(() => [VARIANT_CLASS[props.variant], SIZE_CLASS[props.size]])

/** as-child거나 <button>이 아닐 때 type/disabled 네이티브 속성은 의미 없으므로 생략한다. */
const isNativeButton = computed(() => !props.asChild && props.as === 'button')

/** loading도 disabled와 동일하게 클릭을 막는다 — 네이티브 disabled 속성 하나로 처리한다. */
const isBlocked = computed(() => props.disabled || props.loading)
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :type="isNativeButton ? type : undefined"
    :disabled="isBlocked || undefined"
    :aria-busy="loading || undefined"
    :data-variant="variant"
    :data-size="size"
    :data-loading="loading || undefined"
    class="relative inline-flex items-center justify-center gap-2 rounded-md px-5 font-semibold whitespace-nowrap
           transition-colors duration-100 ease-standard select-none touch-manipulation
           disabled:bg-disabled disabled:text-content-disabled disabled:border-transparent disabled:cursor-default"
    :class="buttonClass"
  >
    <!-- 라벨은 자리(폭)를 유지한 채 시각적으로만 숨긴다 — 로딩 중 버튼 폭이 흔들리지 않게 -->
    <span class="inline-flex items-center gap-2" :class="{ invisible: loading }">
      <slot />
    </span>
    <!-- 스피너 — currentColor 상속(variant/disabled 색 자동 반영), 절대배치로 라벨 위에 중앙 겹침 -->
    <span
      v-if="loading"
      aria-hidden="true"
      class="absolute inset-0 m-auto size-[1em] animate-spin rounded-full border-2 border-current
             border-t-transparent motion-reduce:animate-pulse"
    />
  </Primitive>
</template>

<style scoped>
/* sm(36px) 히트 영역 확장 — 시각 높이가 최소 터치 타겟(48px)보다 낮으므로 루트의 ::before로
   수직 48px 탭 영역을 덧댄다(폭은 버튼 폭으로 충분). 루트가 relative라 absolute 기준이 되고,
   레이아웃에는 영향이 없다. 루트가 버튼이므로 ::before 위의 탭도 그대로 버튼 클릭이 된다. */
[data-size='sm']::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--pr-size-tap-minimum);
  transform: translateY(-50%);
}
</style>
