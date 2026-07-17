<script setup lang="ts">
import { computed } from 'vue'
import type { Gender } from '@/features/auth'
import type { ParticipantTeam } from '../api/rooms'

interface Props {
  name: string
  /** null이면 아직 팀 미배정 — 중립 보더로 표시한다 */
  team: ParticipantTeam | null
  /** 성별 — 이름 색으로 표기(남 파랑·여 빨강). null이면 기본 텍스트 색 */
  gender: Gender | null
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

const GENDER_TEXT = {
  male: 'text-gender-male',
  female: 'text-gender-female',
} as const

const GENDER_LABEL = {
  male: '남성',
  female: '여성',
} as const

const teamBorderClass = computed(() =>
  props.team === null ? 'border-stroke' : TEAM_BORDER[props.team],
)
const teamLabel = computed(() => (props.team === null ? '팀 미배정' : TEAM_LABEL[props.team]))

const nameTextClass = computed(() =>
  props.gender === null ? 'text-content' : GENDER_TEXT[props.gender],
)

const statusLabel = computed(() => (props.isReady ? '준비' : '대기'))
const statusTextClass = computed(() => (props.isReady ? 'text-success' : 'text-warning'))
const dotClass = computed(() => (props.isReady ? 'bg-success-solid' : 'bg-warning-solid'))

/**
 * 팀은 보더 색, 성별은 이름 색으로만 표시되므로(시안) 색약 대응을 위해
 * 접근성 라벨에 팀명·성별을 병기한다
 */
const ariaLabel = computed(() => {
  const genderPart = props.gender === null ? '' : ` · ${GENDER_LABEL[props.gender]}`
  return `${props.name}${genderPart} · ${teamLabel.value} · ${statusLabel.value}`
})
</script>

<template>
  <div
    class="flex h-10 items-center gap-2 rounded-full border-2 px-3"
    :class="teamBorderClass"
    :aria-label="ariaLabel"
    :data-team="team ?? 'none'"
    :data-gender="gender ?? 'none'"
    :data-ready="isReady"
  >
    <span class="size-2 shrink-0 rounded-full" :class="dotClass" aria-hidden="true"></span>
    <span class="truncate text-caption font-semibold" :class="nameTextClass">{{ name }}</span>
    <span class="ml-auto shrink-0 text-caption font-semibold" :class="statusTextClass">
      {{ statusLabel }}
    </span>
  </div>
</template>
