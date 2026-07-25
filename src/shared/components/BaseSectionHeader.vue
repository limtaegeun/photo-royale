<script setup lang="ts">
/**
 * 화면 안 섹션의 제목 행 — 제목(+요약 캡션)과 우측 보조 표기(배지 등)를 한 줄에 둔다.
 * 화면 섹션 헤딩의 위계를 한곳에서 고정해(text-subheading) 화면마다 제목 크기가 달라지는 것을 막는다.
 * 카드 내부 타이틀은 이 컴포넌트가 아니라 text-label을 쓴다(DESIGN_SYSTEM §5 타이포 위계).
 */
interface Props {
  /** 섹션 제목 — h2로 렌더된다(페이지 h1은 앱 셸 헤더가 담당) */
  title: string
  /** 제목 아래 한 줄 요약(선택) — 개수·상태 등 */
  summary?: string
}

withDefaults(defineProps<Props>(), { summary: undefined })
</script>

<template>
  <!-- 우측 표기는 제목 첫 줄 baseline에 맞춘다 — 요약이 두 줄로 늘어도 배지가 따라 내려가지 않는다 -->
  <div class="flex items-baseline justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-subheading text-content">{{ title }}</h2>
      <p v-if="summary" class="mt-1 text-caption text-content-secondary">{{ summary }}</p>
    </div>
    <div v-if="$slots.aside" class="shrink-0">
      <slot name="aside" />
    </div>
  </div>
</template>
