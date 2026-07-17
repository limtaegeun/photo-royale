<script setup lang="ts">
import { ToastClose, ToastDescription, ToastRoot, ToastTitle } from 'reka-ui'
import type { ToastItem } from '@/shared/composables/useToast'

/**
 * 단일 토스트 표현 컴포넌트. BaseToastProvider가 전역 큐를 v-for로 렌더할 때 사용한다.
 * ARIA live region·타이머·스와이프 dismiss는 Reka ToastRoot가 담당한다.
 */
interface Props {
  toast: ToastItem
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

/** 톤별 solid 배경 + on-색 라벨(neutral만 서피스 위 기본 텍스트) */
const TONE_CLASS = {
  neutral: 'bg-surface-strong text-content border border-stroke',
  success: 'bg-success-solid text-on-success',
  warning: 'bg-warning-solid text-on-warning',
  danger: 'bg-danger-solid text-on-danger',
  info: 'bg-info-solid text-on-info',
} as const

function onOpenChange(value: boolean) {
  if (!value) emit('close')
}
</script>

<template>
  <ToastRoot
    :duration="props.toast.duration"
    :data-tone="props.toast.tone"
    class="toast flex items-start gap-3 rounded-lg p-4 shadow-lg"
    :class="TONE_CLASS[props.toast.tone]"
    @update:open="onOpenChange"
  >
    <div class="min-w-0 flex-1">
      <ToastTitle class="text-label font-semibold">{{ props.toast.title }}</ToastTitle>
      <ToastDescription v-if="props.toast.description" class="mt-1 text-caption opacity-90">
        {{ props.toast.description }}
      </ToastDescription>
    </div>
    <ToastClose
      aria-label="닫기"
      class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full
             transition-colors duration-100 ease-standard hover:bg-scrim-weak
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <!-- 텍스트 글리프(×)는 폰트 베이스라인 탓에 원형 배경과 시각 중앙이 어긋난다 — 기하학적 SVG 사용 -->
      <svg aria-hidden="true" class="size-3" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 4l8 8m0-8-8 8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </ToastClose>
  </ToastRoot>
</template>

<style scoped>
/* 진입/이탈·스와이프 애니메이션 — 값은 토큰 참조 */
.toast[data-state='open'] {
  animation: toast-in var(--pr-duration-base) var(--pr-easing-decelerate);
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
    transform: translateY(0.5rem);
  }
}
@keyframes toast-out {
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
</style>
