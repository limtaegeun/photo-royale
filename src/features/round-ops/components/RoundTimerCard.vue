<script setup lang="ts">
import { computed } from 'vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import type { RoundDisplayState } from '../composables/useRoundTimer'
import { ROUND_STATE_LABEL } from '../roundStateStyles'

/**
 * 이 화면의 주 정보 — 남은 시간. 진행자가 뛰면서 흘깃 보는 값이라 가장 큰 위계로 두고,
 * 아래 한 줄에 "몇 라운드의 · 어떤 상태의 · 몇 팀짜리" 맥락을 붙인다.
 */
interface Props {
  /** mm:ss로 이미 포맷된 남은 시간 — 1초 tick의 소유자는 페이지다 */
  formatted: string
  state: RoundDisplayState
  /** 팀편성 차수 = 라운드 번호. 0이면 아직 배정 전이다 */
  roundNumber: number
  /** 이번 라운드에 배정된 팀 수 */
  teamCount: number
}

const props = defineProps<Props>()

/** Tailwind 스캐너 대응 — 완전한 리터럴 클래스명 맵 */
const TIME_COLOR_CLASS = {
  idle: 'text-content-secondary',
  running: 'text-success',
  paused: 'text-warning',
  ended: 'text-content-secondary',
} as const

const summary = computed(
  () =>
    `라운드 ${props.roundNumber} · ${ROUND_STATE_LABEL[props.state]} · ${props.teamCount}팀 배정`,
)
</script>

<template>
  <BaseCard padding="lg">
    <!-- 숫자가 초마다 바뀌어도 자릿수 폭이 흔들리지 않도록 mono + tabular-nums -->
    <p class="text-hero font-mono tabular-nums" :class="TIME_COLOR_CLASS[state]">
      {{ formatted }}
    </p>
    <!-- 색만으로 상태를 알리지 않도록 상태 라벨을 요약 줄에 항상 병기한다 -->
    <p class="mt-2 text-caption text-content-secondary">{{ summary }}</p>
  </BaseCard>
</template>
