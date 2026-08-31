<script setup lang="ts">
import BaseCard from '@/shared/components/BaseCard.vue'
import type { RoundDisplayState } from '../composables/useRoundTimer'
import { ROUND_STATE_TIME_CLASS } from '../roundStateStyles'

/**
 * 이 화면의 주 정보 — 남은 시간. 진행자가 뛰면서 흘깃 보는 값이라 카드에서 가장 큰 위계로 둔다.
 *
 * 숫자 위에는 라운드 번호만 얹는다. 진행 상태(LIVE·일시정지)는 화면 상단 상태 줄의 배지가,
 * 배정 팀 수는 배정 화면이 이미 말하고 있어서 카드에서 반복하면 시선만 나뉜다.
 */
interface Props {
  /** mm:ss로 이미 포맷된 남은 시간 — 1초 tick의 소유자는 페이지다 */
  formatted: string
  state: RoundDisplayState
  /** 팀편성 차수 = 라운드 번호. 0이면 아직 배정 전이라 표기하지 않는다 */
  roundNumber: number
}

defineProps<Props>()
</script>

<template>
  <BaseCard padding="lg">
    <p v-if="roundNumber > 0" class="text-label text-content-secondary">
      라운드 {{ roundNumber }}
    </p>
    <!-- 숫자가 초마다 바뀌어도 자릿수 폭이 흔들리지 않도록 mono + tabular-nums -->
    <p
      class="text-hero font-mono tabular-nums"
      :class="[ROUND_STATE_TIME_CLASS[state], roundNumber > 0 && 'mt-2']"
    >
      {{ formatted }}
    </p>
  </BaseCard>
</template>
