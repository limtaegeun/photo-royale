<script setup lang="ts">
interface Props {
  /** 컨트롤 높이 — md/lg는 최소 터치 타겟(48px) 충족 */
  size?: 'sm' | 'md' | 'lg'
  /** 텍스트 계열 input type만 허용 */
  type?: 'text' | 'search' | 'url' | 'tel' | 'email' | 'password'
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  type: 'text',
  placeholder: undefined,
  disabled: false,
})

const model = defineModel<string>({ default: '' })

/**
 * Tailwind 스캐너 대응 — 완전한 리터럴 클래스명 맵.
 * 폰트는 모든 크기에서 text-body(17px) — iOS 입력 확대(<16px) 방지.
 */
const SIZE_CLASS = {
  sm: 'h-(--pr-size-control-sm) text-body',
  md: 'h-(--pr-size-control-md) text-body',
  lg: 'h-(--pr-size-control-lg) text-body',
} as const
</script>

<template>
  <input
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :data-size="size"
    class="w-full rounded-lg border border-stroke bg-surface px-4 text-content
           placeholder:text-content-secondary transition-colors duration-100 ease-standard
           focus:border-stroke-strong focus:outline-none
           disabled:bg-disabled disabled:text-content-disabled disabled:cursor-default"
    :class="SIZE_CLASS[props.size]"
  />
</template>
