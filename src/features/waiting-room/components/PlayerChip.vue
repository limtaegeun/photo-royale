<script setup lang="ts">
import { computed } from 'vue'
import type { ParticipantTeam } from '../stores/useWaitingRoomStore'

interface Props {
  name: string
  team: ParticipantTeam
  isReady: boolean
}

const props = defineProps<Props>()

/** Tailwind 스캐너 대응 — 완전한 리터럴 클래스명 맵 (팀 보더는 완장 표식과 같은 solid 색) */
const TEAM_BORDER = {
  red: 'border-team-red-solid',
  blue: 'border-team-blue-solid',
  green: 'border-team-green-solid',
  orange: 'border-team-orange-solid',
} as const

const TEAM_LABEL = {
  red: '레드팀',
  blue: '블루팀',
  green: '그린팀',
  orange: '오렌지팀',
} as const

const statusLabel = computed(() => (props.isReady ? '준비' : '대기'))
const statusTextClass = computed(() => (props.isReady ? 'text-success' : 'text-warning'))
const dotClass = computed(() => (props.isReady ? 'bg-success-solid' : 'bg-warning-solid'))

/** 팀은 보더 색으로만 표시되므로(시안) 색약 대응을 위해 접근성 라벨에 팀명을 병기한다 */
const ariaLabel = computed(
  () => `${props.name} · ${TEAM_LABEL[props.team]} · ${statusLabel.value}`,
)
</script>

<template>
  <div
    class="flex h-10 items-center gap-2 rounded-full border-2 px-3"
    :class="TEAM_BORDER[props.team]"
    :aria-label="ariaLabel"
    :data-team="team"
    :data-ready="isReady"
  >
    <span class="size-2 shrink-0 rounded-full" :class="dotClass" aria-hidden="true"></span>
    <span class="truncate text-caption font-semibold text-content">{{ name }}</span>
    <span class="ml-auto shrink-0 text-caption font-semibold" :class="statusTextClass">
      {{ statusLabel }}
    </span>
  </div>
</template>
