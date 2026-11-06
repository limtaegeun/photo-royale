<script lang="ts">
import { ref } from 'vue'

/** 돋보기를 한 번 써 봤으면 안내를 다시 띄우지 않는다 — 카드가 바뀌어도 이어지게 컴포넌트 밖에 둔다 */
const hasUsedLens = ref(false)
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef, type CSSProperties } from 'vue'

/**
 * 판정 사진 — 세로 사진을 잘리지 않게 넣고 남는 자리는 흐린 같은 사진으로 채운다. 길게 누르면 돋보기가 떠서
 * 작은 화면에서도 완장 글자를 확인할 수 있다. 세로 스크롤은 막지 않고, 손가락이 움직이면 길게 누르기를 푼다.
 */
interface Props {
  photo: string
  alt: string
}

defineProps<Props>()

const LONG_PRESS_MS = 220
/** 이만큼 움직이면 스크롤로 보고 길게 누르기를 푼다 */
const LONG_PRESS_SLOP_PX = 8
const LENS_SIZE_PX = 140
const LENS_ZOOM = 3
/** 손가락에 가리지 않게 돋보기를 손가락 위로 띄운다 */
const LENS_LIFT_PX = 160
const LENS_BELOW_PX = 20
const LENS_VIBRATION_MS = 8

const stageRef = useTemplateRef<HTMLElement>('stage')
const shotRef = useTemplateRef<HTMLImageElement>('shot')

const lensStyle = ref<CSSProperties | null>(null)
const isLensOpen = computed(() => lensStyle.value !== null)

let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressX = 0
let pressY = 0

function placeLens(clientX: number, clientY: number) {
  const stage = stageRef.value
  const shot = shotRef.value
  if (stage === null || shot === null || shot.naturalWidth === 0) return
  const box = stage.getBoundingClientRect()
  const ratio = shot.naturalWidth / shot.naturalHeight
  const shownHeight = Math.min(box.height, box.width / ratio)
  const shownWidth = shownHeight * ratio
  const offsetX = (box.width - shownWidth) / 2
  const offsetY = (box.height - shownHeight) / 2
  const x = clientX - box.left
  const y = clientY - box.top
  const half = LENS_SIZE_PX / 2
  const top = y - LENS_LIFT_PX >= 0 ? y - LENS_LIFT_PX : Math.min(box.height - LENS_SIZE_PX, y + LENS_BELOW_PX)
  lensStyle.value = {
    width: `${LENS_SIZE_PX}px`,
    height: `${LENS_SIZE_PX}px`,
    left: `${Math.max(0, Math.min(box.width - LENS_SIZE_PX, x - half))}px`,
    top: `${top}px`,
    backgroundImage: `url("${shot.currentSrc || shot.src}")`,
    backgroundSize: `${shownWidth * LENS_ZOOM}px ${shownHeight * LENS_ZOOM}px`,
    backgroundPosition: `${-(x - offsetX) * LENS_ZOOM + half}px ${-(y - offsetY) * LENS_ZOOM + half}px`,
  }
}

function handlePointerDown(event: PointerEvent) {
  pressX = event.clientX
  pressY = event.clientY
  const { pointerId } = event
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    placeLens(pressX, pressY)
    if (lensStyle.value === null) return
    stageRef.value?.setPointerCapture?.(pointerId)
    hasUsedLens.value = true
    navigator.vibrate?.(LENS_VIBRATION_MS)
  }, LONG_PRESS_MS)
}

function handlePointerMove(event: PointerEvent) {
  if (isLensOpen.value) {
    placeLens(event.clientX, event.clientY)
    return
  }
  const moved =
    Math.abs(event.clientX - pressX) > LONG_PRESS_SLOP_PX ||
    Math.abs(event.clientY - pressY) > LONG_PRESS_SLOP_PX
  if (moved) clearTimeout(pressTimer)
}

function closeLens() {
  clearTimeout(pressTimer)
  lensStyle.value = null
}

onBeforeUnmount(() => clearTimeout(pressTimer))
</script>

<template>
  <div
    ref="stage"
    data-testid="killshot-stage"
    class="stage relative min-h-0 min-w-0 cursor-zoom-in overflow-hidden rounded-lg bg-elevated select-none touch-pan-y"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="closeLens"
    @pointercancel="closeLens"
    @contextmenu.prevent
  >
    <img :src="photo" alt="" aria-hidden="true" draggable="false" class="stage-fill" />
    <img
      ref="shot"
      :src="photo"
      :alt="alt"
      draggable="false"
      class="pointer-events-none relative block size-full object-contain"
    />
    <span
      v-if="!hasUsedLens"
      class="pointer-events-none absolute right-2 bottom-2 rounded-full bg-scrim-strong px-2 py-1 text-caption text-content-secondary"
    >
      길게 누르면 확대
    </span>
    <div
      v-if="lensStyle !== null"
      aria-hidden="true"
      data-testid="killshot-lens"
      class="pointer-events-none absolute z-10 rounded-full border-2 border-content bg-no-repeat shadow-lg"
      :style="lensStyle"
    />
  </div>
</template>

<style scoped>
.stage {
  -webkit-touch-callout: none;
}
/* 사진 네 변 밖까지 넓혀 흐림의 옅은 가장자리가 보이지 않게 한다 */
.stage-fill {
  position: absolute;
  inset: -2rem;
  width: calc(100% + 4rem);
  height: calc(100% + 4rem);
  max-width: none;
  object-fit: cover;
  pointer-events: none;
  filter: blur(1.375rem) brightness(0.5);
}
</style>
