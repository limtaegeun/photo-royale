<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 팀 색상 — 지정되면 tone보다 우선한다 */
  team?: 'red' | 'blue' | 'green' | 'orange'
  /** 상태·브랜드 톤 — team이 없을 때만 적용 */
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  /** fill: 배경을 채움 / text: 배경 투명, 텍스트만 색상 적용 */
  appearance?: 'fill' | 'text'
  /** 크기 — sm(기본, 인라인 상태 표식) / md(카테고리·브랜드 태그) */
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  team: undefined,
  tone: 'neutral',
  appearance: 'fill',
  size: 'sm',
})

/**
 * Tailwind 스캐너 대응 — 완전한 리터럴 클래스명 맵.
 * team이 있으면 team 색, 없으면 tone 색을 쓴다.
 * fill: 채운 배경 + on-색 라벨 / text: 투명 배경 + 읽기용 텍스트 색.
 */
const TEAM_FILL = {
  red: 'bg-team-red-solid text-on-team-red',
  blue: 'bg-team-blue-solid text-on-team-blue',
  green: 'bg-team-green-solid text-on-team-green',
  orange: 'bg-team-orange-solid text-on-team-orange',
} as const

const TEAM_TEXT = {
  red: 'text-team-red',
  blue: 'text-team-blue',
  green: 'text-team-green',
  orange: 'text-team-orange',
} as const

const TONE_FILL = {
  brand: 'bg-brand text-on-brand',
  success: 'bg-success-solid text-on-success',
  warning: 'bg-warning-solid text-on-warning',
  danger: 'bg-danger-solid text-on-danger',
  info: 'bg-info-solid text-on-info',
  neutral: 'bg-neutral text-content',
} as const

const TONE_TEXT = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-content-secondary',
} as const

const SIZE_CLASS = {
  sm: 'h-6 px-2',
  md: 'h-7 px-3',
} as const

const colorClass = computed(() => {
  if (props.appearance === 'text') {
    return props.team ? TEAM_TEXT[props.team] : TONE_TEXT[props.tone]
  }
  return props.team ? TEAM_FILL[props.team] : TONE_FILL[props.tone]
})
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full text-caption font-semibold whitespace-nowrap"
    :class="[colorClass, SIZE_CLASS[props.size]]"
    :data-appearance="appearance"
    :data-team="team"
    :data-tone="team ? undefined : tone"
    :data-size="size"
  >
    <slot />
  </span>
</template>
