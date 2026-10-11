<script setup lang="ts">
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import { VenueMapPreview } from '@/features/waiting-room'

/**
 * 콕핏 지도 시트(P08 슬롯 3, 단계 1 정적) — 진행자가 올린 행사장 지도 이미지를 콕핏을 떠나지
 * 않고 본다. 경계·안전 구역·집결지를 뛰는 중에 한 번에 확인하는 용도라 이미지 하나가 전부다.
 * 지도를 누르면 화면 전체로 열어 손가락으로 키우고 줄인다(VenueMapPreview). 링크·다운로드 경로는 두지 않는다.
 * 지도가 없는 방은 콕핏이 슬롯 자체를 숨기므로 이 시트는 지도를 받은 뒤에만 마운트된다.
 */
interface Props {
  /** 행사장 지도(JPEG 데이터 URL) — 대기실에서 미리 받아 둔 것이라 네트워크 없이 바로 그린다 */
  mapImage: string
}

defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="행사장 지도">
    <div class="flex flex-col gap-3">
      <!-- 누르면 화면 전체로 크게 본다. 시트 자체(85dvh)보다 낮게 잡아 제목·안전 문구가 항상 보인다 -->
      <VenueMapPreview :image="mapImage" alt="행사장 지도" image-class="max-h-[70dvh]" />
      <!-- 대기실 안전 수칙 카드와 같은 문장 — 지도를 보는 순간이 규칙을 떠올릴 순간이다 -->
      <p class="text-caption text-pretty break-keep text-content-secondary">
        무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
      </p>
    </div>
  </BaseBottomSheet>
</template>
