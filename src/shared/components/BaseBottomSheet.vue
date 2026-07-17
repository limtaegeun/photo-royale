<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  VisuallyHidden,
} from 'reka-ui'

/**
 * Reka Dialog 기반 하단 시트(모바일 우선 코어 패턴). 화면 하단에서 올라오며
 * 하단 safe-area를 확보한다. 중앙 모달이 필요하면 BaseDialog를 쓴다.
 * focus trap·scroll lock·Escape/backdrop dismiss·포털은 Reka가 담당한다.
 */
interface Props {
  /** 접근성 필수 — 스크린리더가 읽는 시트 제목 */
  title: string
  /** 보조 설명(선택) */
  description?: string
  /** 제목을 시각적으로 숨김(스크린리더 전용). 커스텀 헤더를 직접 그릴 때 사용 */
  hideTitle?: boolean
}

withDefaults(defineProps<Props>(), {
  description: undefined,
  hideTitle: false,
})

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay class="overlay fixed inset-0 z-(--pr-z-sheet) bg-scrim" />
      <DialogContent
        class="content fixed inset-x-0 bottom-0 z-(--pr-z-sheet) max-h-[85dvh] overflow-y-auto
               rounded-t-xl bg-elevated px-6 pt-3 pb-(--pr-inset-bottom-safe) focus:outline-none"
      >
        <!-- 드래그 핸들(시각적 어포던스) -->
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-stroke-strong" aria-hidden="true" />

        <VisuallyHidden v-if="hideTitle">
          <DialogTitle>{{ title }}</DialogTitle>
        </VisuallyHidden>
        <DialogTitle v-else class="text-subheading text-content">{{ title }}</DialogTitle>

        <DialogDescription v-if="description" class="mt-2 text-body text-content-secondary">
          {{ description }}
        </DialogDescription>

        <div class="mt-4 pb-6">
          <slot />
        </div>

        <DialogClose
          aria-label="닫기"
          class="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full
                 text-content-secondary transition-colors duration-100 ease-standard
                 hover:bg-surface hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <!-- 텍스트 글리프(×)는 폰트 베이스라인 탓에 원형 배경과 시각 중앙이 어긋난다 — 기하학적 SVG 사용 -->
          <svg aria-hidden="true" class="size-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8m0-8-8 8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* 슬라이드업/페이드 — Reka가 data-state=closed에서 애니메이션 종료까지 언마운트를 지연한다. */
.overlay[data-state='open'] {
  animation: overlay-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
.overlay[data-state='closed'] {
  animation: overlay-out var(--pr-duration-fast) var(--pr-easing-standard);
}
.content[data-state='open'] {
  animation: sheet-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
.content[data-state='closed'] {
  animation: sheet-out var(--pr-duration-fast) var(--pr-easing-standard);
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}
@keyframes overlay-out {
  to {
    opacity: 0;
  }
}
@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
}
@keyframes sheet-out {
  to {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay,
  .content {
    animation: none;
  }
}
</style>
