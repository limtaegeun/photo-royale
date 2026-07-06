<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 팀 색상 — 지정되면 tone보다 우선한다 */
  team?: 'red' | 'blue' | 'green' | 'orange'
  /** 상태 톤 — team이 없을 때만 적용 */
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  /** fill: 배경을 채움 / text: 배경 투명, 텍스트만 색상 적용 */
  appearance?: 'fill' | 'text'
}

const props = withDefaults(defineProps<Props>(), {
  team: undefined,
  tone: 'neutral',
  appearance: 'fill',
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
  success: 'bg-success-solid text-on-success',
  warning: 'bg-warning-solid text-on-warning',
  danger: 'bg-danger-solid text-on-danger',
  info: 'bg-info-solid text-on-info',
  neutral: 'bg-neutral text-content',
} as const

const TONE_TEXT = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-content-secondary',
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
    class="inline-flex h-6 items-center justify-center rounded-full px-2 text-caption font-semibold whitespace-nowrap"
    :class="colorClass"
    :data-appearance="appearance"
    :data-team="team"
    :data-tone="team ? undefined : tone"
  >
    <slot />
  </span>
</template>
