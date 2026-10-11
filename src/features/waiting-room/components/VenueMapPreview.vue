<script setup lang="ts">
import { ref } from 'vue'
import VenueMapViewer from './VenueMapViewer.vue'

/**
 * 누르면 크게 보는 행사장 지도 미리보기 — 진행자의 지도 시트와 참가자의 콕핏 지도 시트가 같은 모양으로 쓴다.
 * 오른쪽 아래 확대 표시로 누를 수 있다는 걸 알리고, 누르면 VenueMapViewer 를 화면 전체로 연다.
 * 링크·다운로드 경로는 두지 않는다.
 */
interface Props {
  /** 행사장 지도(JPEG 데이터 URL) */
  image: string
  /** 미리보기 이미지의 대체 텍스트 — 자리마다 다르다(진행자 '행사장 지도 미리보기' · 참가자 '행사장 지도') */
  alt: string
  /** 미리보기 높이 제한 — 진행자 시트는 낮게, 콕핏은 크게 */
  imageClass?: string
}

withDefaults(defineProps<Props>(), { imageClass: '' })

const isViewerOpen = ref(false)
</script>

<template>
  <div>
    <button
      type="button"
      aria-label="행사장 지도 크게 보기"
      class="relative block w-full overflow-hidden rounded-lg border border-stroke bg-surface
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      @click="isViewerOpen = true"
    >
      <img :src="image" :alt="alt" decoding="async" class="w-full object-contain" :class="imageClass" />
      <span
        aria-hidden="true"
        class="absolute right-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full bg-scrim text-content"
      >
        <svg class="size-4" viewBox="0 0 16 16" fill="none">
          <path
            d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>
    <VenueMapViewer v-model:open="isViewerOpen" :image="image" />
  </div>
</template>
