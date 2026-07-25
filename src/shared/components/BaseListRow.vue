<script setup lang="ts">
/**
 * 설정·정보 리스트의 한 행 — 좌측 라벨(+캡션), 우측 컨트롤(버튼·스위치 등)의 2열 구조.
 * 행 높이를 최소 컨트롤 높이(56px)로 고정해 컨트롤 크기가 달라도 행 리듬이 흔들리지 않게 한다.
 * 여러 행을 담을 때는 BaseCard(padding="none")로 감싸고 `divide-y divide-stroke`로 구분선을 준다.
 */
interface Props {
  /** 행이 무엇을 설정하는지 — text-label 위계 */
  label: string
  /** 라벨 아래 한 줄 보조 설명(선택). 한 줄을 넘기면 잘라낸다(행 높이 고정 유지) */
  caption?: string
}

withDefaults(defineProps<Props>(), { caption: undefined })
</script>

<template>
  <div class="flex min-h-(--pr-size-control-lg) items-center justify-between gap-4 px-4 py-3">
    <div class="min-w-0">
      <p class="text-label text-content">{{ label }}</p>
      <p v-if="caption" class="mt-1 truncate text-caption text-content-secondary">
        {{ caption }}
      </p>
    </div>
    <div class="shrink-0">
      <slot name="control" />
    </div>
  </div>
</template>
