<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

/**
 * 체크박스 + 라벨 한 줄 — Reka Checkbox primitive(CheckboxRoot/CheckboxIndicator) 기반.
 * role="checkbox"·aria-checked·Space 키 조작은 Reka가 맡고, 스타일만 시맨틱 유틸리티로 쓴다.
 * 행 전체가 하나의 <label>이라 글자를 눌러도 체크된다 — 박스(24px)만 받게 두면 손끝이 빗나가기 쉽다.
 * 행 높이는 최소 터치 타겟(48px)이다. 라벨 글자는 기본 슬롯으로 받는다.
 * 단일 boolean 확인·동의용이다. 설정 on/off는 BaseSwitch를 쓴다.
 */
interface Props {
  /** 비활성 — 흐려지고 조작이 막힌다 */
  disabled?: boolean
}

withDefaults(defineProps<Props>(), { disabled: false })

const model = defineModel<boolean>({ default: false })

/** Reka는 'indeterminate'도 내보낸다 — 이 컴포넌트는 두 상태만 쓰므로 boolean으로 좁힌다 */
function onUpdate(next: boolean | 'indeterminate') {
  model.value = next === true
}
</script>

<template>
  <label
    class="flex min-h-(--pr-size-control-md) cursor-pointer items-center gap-3 has-disabled:cursor-not-allowed"
  >
    <CheckboxRoot
      :model-value="model"
      :disabled="disabled"
      class="flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-stroke-strong bg-surface
             transition-colors duration-100 ease-standard
             data-[state=checked]:border-accent data-[state=checked]:bg-accent
             disabled:opacity-50
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      @update:model-value="onUpdate"
    >
      <CheckboxIndicator class="flex text-on-accent">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <!-- text-pretty는 쓰지 않는다 — 마지막 줄을 늘리려고 첫 줄을 일찍 끊어 "위 / 내용에"처럼 말이 갈라졌다 -->
    <span class="min-w-0 text-body break-keep text-content select-none">
      <slot />
    </span>
  </label>
</template>
