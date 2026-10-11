<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { DialogClose, DialogContent, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import BaseButton from '@/shared/components/BaseButton.vue'
import { usePinchZoom } from '../composables/usePinchZoom'

/**
 * 행사장 지도 크게 보기(P08 §2.2) — 지도를 누르면 화면 전체로 열고, 손가락으로 키우고 줄이고 옮긴다.
 * 진행자(대기실 지도 시트의 미리보기)와 참가자(콕핏 지도 시트)가 함께 쓴다. 시트 위에 겹쳐 열리므로
 * 닫으면 보던 시트로 돌아간다. 열 때마다 지도 전체가 보이는 크기에서 시작한다.
 * 두 손가락 벌리기·오므리기, 끌기, 두 번 탭(마우스는 휠)과 아래 확대·축소 버튼으로 움직인다.
 */
interface Props {
  /** 행사장 지도(JPEG 데이터 URL) — 받아 둔 것을 그대로 그려 네트워크가 없어도 열린다 */
  image: string
}

defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const stage = ref<HTMLElement | null>(null)
const {
  transform,
  animating,
  canZoomIn,
  canZoomOut,
  zoomIn,
  zoomOut,
  setStageSize,
  setImageSize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
} = usePinchZoom(stage)

// 무대가 그려지면(열 때마다 새로 그려진다) 크기를 재고, 화면을 돌리면 다시 잰다
let resizeObserver: ResizeObserver | null = null
watch(
  stage,
  (element) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (element === null) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setStageSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(element)
    }
  },
  { flush: 'post' },
)
onBeforeUnmount(() => resizeObserver?.disconnect())

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogContent
        class="viewer fixed inset-0 z-(--pr-z-modal) flex flex-col bg-canvas pt-(--pr-inset-top-safe)
               pb-(--pr-inset-bottom-safe) focus:outline-none"
        :aria-describedby="undefined"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 pr-2 pl-6">
          <DialogTitle class="text-subheading text-content">행사장 지도</DialogTitle>
          <DialogClose
            aria-label="닫기"
            class="inline-flex size-(--pr-size-control-md) items-center justify-center rounded-full
                   text-content-secondary transition-colors duration-100 ease-standard
                   hover:bg-surface hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg aria-hidden="true" class="size-5" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </DialogClose>
        </div>

        <!-- 무대 — 손가락 동작을 브라우저 화면 확대 대신 지도가 받는다(touch-none) -->
        <div
          ref="stage"
          data-testid="venue-map-stage"
          class="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
        >
          <img
            :src="image"
            alt="행사장 지도"
            draggable="false"
            class="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            :class="{ 'transition-transform duration-200 ease-standard': animating }"
            :style="{ transform }"
            @load="onImageLoad"
          />
        </div>

        <div class="flex shrink-0 items-center justify-center gap-4 px-6 py-3">
          <BaseButton
            variant="neutral"
            shape="circle"
            padding="none"
            class="w-(--pr-size-control-md)"
            aria-label="축소"
            :disabled="!canZoomOut"
            @click="zoomOut"
          >
            <svg aria-hidden="true" class="size-5" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </BaseButton>
          <BaseButton
            variant="neutral"
            shape="circle"
            padding="none"
            class="w-(--pr-size-control-md)"
            aria-label="확대"
            :disabled="!canZoomIn"
            @click="zoomIn"
          >
            <svg aria-hidden="true" class="size-5" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </BaseButton>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* 열고 닫을 때 페이드 — Reka가 data-state=closed에서 애니메이션 종료까지 언마운트를 지연한다 */
.viewer[data-state='open'] {
  animation: viewer-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
.viewer[data-state='closed'] {
  animation: viewer-out var(--pr-duration-fast) var(--pr-easing-standard);
}

@keyframes viewer-in {
  from {
    opacity: 0;
  }
}
@keyframes viewer-out {
  to {
    opacity: 0;
  }
}
</style>
