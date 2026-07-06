<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 버튼 역할별 색상 톤 */
  variant?: 'primary' | 'neutral' | 'danger' | 'ghost'
  /** 버튼 크기 — md/lg는 최소 터치 타겟(48px) 충족 */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  type: 'button',
})

/**
 * Tailwind 스캐너는 동적 문자열을 인식하지 못하므로 완전한 리터럴 클래스명으로 매핑한다.
 * 색은 시맨틱 유틸리티(bg-brand 등)만 사용 — primitive 유틸리티는 존재하지 않는다.
 */
const VARIANT_CLASS = {
  primary: 'bg-brand text-on-brand active:bg-brand-pressed',
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
</script>

<template>
  <button
    class="inline-flex items-center justify-center gap-2 rounded-md px-5 font-semibold whitespace-nowrap
           transition-colors duration-100 ease-standard select-none touch-manipulation
           disabled:bg-disabled disabled:text-content-disabled disabled:border-transparent disabled:cursor-default"
    :class="buttonClass"
    :type="type"
    :disabled="disabled"
    :data-variant="variant"
    :data-size="size"
  >
    <slot />
  </button>
</template>
