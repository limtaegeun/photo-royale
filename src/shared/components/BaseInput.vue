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

// autofill: 브라우저 자동완성이 UA 스타일로 밝은 배경을 강제한다. background-color는
// 일반 스타일로 못 이기므로 inset shadow로 서피스색을 덮고 글자색은 text-fill로 복원한다.
// disabled인 채로 autofill되면 이 shadow가 disabled 배경을 덮으므로, disabled:autofill:에서
// shadow를 끄고 글자색도 disabled 색으로 되돌린다(스택 variant가 더 구체적이라 우선한다).
// (template 주석으로 두면 다중 루트가 되어 attrs fallthrough가 깨지므로 여기에 둔다)
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
           autofill:shadow-[inset_0_0_0_1000px_var(--pr-color-bg-surface)]
           autofill:[-webkit-text-fill-color:var(--pr-color-text-primary)]
           disabled:autofill:shadow-none
           disabled:autofill:[-webkit-text-fill-color:var(--pr-color-text-disabled)]
           disabled:bg-disabled disabled:text-content-disabled disabled:cursor-default"
    :class="SIZE_CLASS[props.size]"
  />
</template>
