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
 * Reka Dialog 기반 범용 모달. focus trap·scroll lock·Escape/backdrop dismiss·포털은
 * Reka가 담당하고, 스타일은 전부 프로젝트 시맨틱 토큰으로 작성한다.
 * 화면 중앙 정렬. 하단 시트가 필요하면 BaseBottomSheet를 쓴다.
 */
interface Props {
  /** 접근성 필수 — 스크린리더가 읽는 대화상자 제목 */
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
    <!-- 트리거 슬롯을 주면 열림 제어를 Reka에 위임(as-child로 BaseButton 등과 합성) -->
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay class="overlay fixed inset-0 z-(--pr-z-modal) bg-scrim" />
      <DialogContent
        class="content fixed top-1/2 left-1/2 z-(--pr-z-modal) w-[calc(100%-2rem)] max-w-sm
               -translate-x-1/2 -translate-y-1/2 rounded-xl bg-elevated p-6 focus:outline-none"
      >
        <VisuallyHidden v-if="hideTitle">
          <DialogTitle>{{ title }}</DialogTitle>
        </VisuallyHidden>
        <!-- pr-8: 닫기 버튼(right-4 + size-8) 자리를 비워 제목이 아이콘 밑으로 파고들지 않게 한다 -->
        <DialogTitle v-else class="pr-8 text-heading text-balance break-keep text-content">
          {{ title }}
        </DialogTitle>

        <!-- 여러 줄로 접히는 문장이라 행간을 relaxed로 넓힌다(본문 기본 1.45 → 1.5).
             제목과의 간격도 8px는 붙어 보여 12px로 띄운다.
             모달 설명은 두세 줄짜리 짧은 문장이라 text-pretty(끝줄만 보정)보다 balance가 낫다 —
             줄 길이를 고르게 맞추면 쉼표·어절 경계에서 끊겨 한 호흡으로 읽힌다 -->
        <DialogDescription
          v-if="description"
          class="mt-3 text-body leading-(--pr-line-height-relaxed) text-balance break-keep
                 text-content-secondary"
        >
          {{ description }}
        </DialogDescription>

        <!-- 읽는 영역과 행동 영역을 확실히 갈라 놓는다 — 붙어 있으면 문장을 다 읽기 전에 누른다 -->
        <div class="mt-6">
          <slot />
        </div>

        <!-- 우상단 닫기 버튼 -->
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
/* 진입/이탈 애니메이션 — Reka가 data-state=closed에서 애니메이션 종료까지 언마운트를 지연한다.
   값은 전부 토큰 참조(DESIGN_SYSTEM: 애니메이션은 scoped style 허용). */
.overlay[data-state='open'] {
  animation: fade-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
.overlay[data-state='closed'] {
  animation: fade-out var(--pr-duration-fast) var(--pr-easing-standard);
}
/* 모달 본체는 **페이드만** 한다. 확대·이동을 섞으면 화면 한가운데에서 크기가 튀어
   시선이 따라가야 하고, 판단을 요구하는 내용(삭제·종료 확인)이 흔들려 보인다.
   위치는 유틸리티(-translate-x-1/2 -translate-y-1/2)가 잡으므로 keyframes는 transform을
   건드리지 않는다 — 건드리면 애니메이션 동안 그 정렬을 덮어써 중앙이 어긋난다. */
.content[data-state='open'] {
  animation: fade-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
.content[data-state='closed'] {
  animation: fade-out var(--pr-duration-fast) var(--pr-easing-standard);
}

/* 스크림과 본체가 같은 페이드를 공유한다 — 둘이 다른 곡선으로 움직이면 한 겹처럼 보이지 않는다 */
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes fade-out {
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay,
  .content {
    animation: none;
  }
}
</style>
