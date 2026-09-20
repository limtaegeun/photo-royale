<script setup lang="ts">
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'

/**
 * 콕핏 지도 시트(P08 슬롯 3, 단계 1 정적) — 운영자가 방에 등록한 행사장 지도 이미지를 콕핏을 떠나지
 * 않고 본다. 경계·안전 구역·집결지를 뛰는 중에 한 번에 확인하는 용도라 이미지 하나가 전부다.
 * 확대는 브라우저 기본(핀치 줌·스크롤)에 맡기고, 링크·다운로드 경로는 두지 않는다.
 * 지도가 등록되지 않은 방은 콕핏이 슬롯 자체를 숨기므로 이 시트는 URL이 있을 때만 마운트된다.
 */
interface Props {
  /** 방 문서의 mapImageUrl — rules가 https 문자열만 받아 그대로 src로 쓴다 */
  mapImageUrl: string
}

defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="행사장 지도">
    <div class="flex flex-col gap-3">
      <!-- 큰 이미지는 이 상자 안에서 스크롤·핀치 줌한다(touch-action에 pinch-zoom을 남겨 둔다).
           시트 자체(85dvh)보다 낮게 잡아 제목·안전 문구가 항상 보인다 -->
      <div
        class="max-h-[70dvh] touch-pan-x touch-pan-y touch-pinch-zoom overflow-auto rounded-lg border border-stroke bg-surface"
      >
        <img
          :src="mapImageUrl"
          alt="행사장 지도"
          decoding="async"
          class="w-full rounded-lg object-contain"
        />
      </div>
      <!-- 대기실 안전 수칙 카드와 같은 문장 — 지도를 보는 순간이 규칙을 떠올릴 순간이다 -->
      <p class="text-caption text-pretty break-keep text-content-secondary">
        무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
      </p>
    </div>
  </BaseBottomSheet>
</template>
