<script setup lang="ts">
import { ToastClose, ToastDescription, ToastRoot, ToastTitle } from 'reka-ui'
import type { ToastItem } from '@/shared/composables/useToast'

/**
 * 단일 토스트 표현 컴포넌트. BaseToastProvider가 전역 큐를 v-for로 렌더할 때 사용한다.
 * ARIA live region·타이머·스와이프 dismiss는 Reka ToastRoot가 담당한다.
 *
 * 디자인: 뉴트럴 elevated 카드 + 톤 컬러 아이콘 (Sonner/Linear 계열 패턴).
 * 톤별로 아이콘 모양이 달라(체크/삼각형/X/i) 색약 사용자도 색 없이 상태를 구분할 수 있다.
 */
interface Props {
  toast: ToastItem
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

/** 톤별 아이콘 색 — neutral은 아이콘 없이 텍스트만 표시 */
const TONE_ICON_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
} as const

/** heroicons mini(20px solid) 패스 — success: check-circle / warning: exclamation-triangle / danger: x-circle / info: information-circle */
const TONE_ICON_PATH = {
  success:
    'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 0 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z',
  warning:
    'M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  danger:
    'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z',
  info: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z',
} as const

function onOpenChange(value: boolean) {
  if (!value) emit('close')
}
</script>

<template>
  <ToastRoot
    :duration="props.toast.duration"
    :data-tone="props.toast.tone"
    class="toast flex items-start gap-3 rounded-xl border border-stroke bg-surface-strong p-4 shadow-lg"
    @update:open="onOpenChange"
  >
    <svg
      v-if="props.toast.tone !== 'neutral'"
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="size-5 shrink-0"
      :class="TONE_ICON_CLASS[props.toast.tone]"
    >
      <path fill-rule="evenodd" :d="TONE_ICON_PATH[props.toast.tone]" clip-rule="evenodd" />
    </svg>
    <div class="min-w-0 flex-1">
      <ToastTitle class="text-label font-semibold text-content">{{ props.toast.title }}</ToastTitle>
      <ToastDescription v-if="props.toast.description" class="mt-1 text-caption text-content-secondary">
        {{ props.toast.description }}
      </ToastDescription>
    </div>
    <ToastClose
      aria-label="닫기"
      class="-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full
             text-content-tertiary transition-colors duration-100 ease-standard
             hover:bg-scrim-weak hover:text-content
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="size-4">
        <path
          d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
        />
      </svg>
    </ToastClose>
  </ToastRoot>
</template>

<style scoped>
/* 진입/이탈·스와이프 애니메이션 — 값은 토큰 참조 */
.toast[data-state='open'] {
  animation: toast-in var(--pr-duration-slow) var(--pr-easing-decelerate);
}
.toast[data-state='closed'] {
  animation: toast-out var(--pr-duration-fast) var(--pr-easing-standard);
}
.toast[data-swipe='move'] {
  transform: translateX(var(--reka-toast-swipe-move-x));
}
.toast[data-swipe='cancel'] {
  transform: translateX(0);
  transition: transform var(--pr-duration-fast) var(--pr-easing-standard);
}
.toast[data-swipe='end'] {
  animation: toast-out var(--pr-duration-fast) var(--pr-easing-standard);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(1rem) scale(0.97);
  }
}
@keyframes toast-out {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
</style>
