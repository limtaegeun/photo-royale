<!--
  대기실 명단·배정 보드가 공유하는 참가자 표시 칩.
  성별은 이름 색(남 파랑·여 빨강), 팀은 보더 색으로 표기하고,
  색약 대응으로 접근성 라벨에 성별·팀·상태 텍스트를 병기한다.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Gender } from '@/features/auth'
import { GROUP_LABELS, displayGroup, groupSolidBorderClass } from '@/features/team-assignment'

interface Props {
  name: string
  /** 배정된 완장 알파벳(그룹 색은 완장에서 파생). null이면 미배정 — 중립 보더로 표시한다 */
  team: string | null
  /** 성별 — 이름 색으로 표기(남 파랑·여 빨강). null이면 기본 텍스트 색 */
  gender: Gender | null
  /**
   * 준비 여부 — 대기실 명단에서만 의미가 있다. undefined면(배정 보드 드래프트 맥락엔 레디 개념이
   * 없으므로) 상태 점·상태 라벨을 렌더하지 않고 접근성 라벨에서도 상태를 생략한다.
   */
  isReady?: boolean
}

// Vue는 boolean prop이 없으면 false로 캐스팅하므로, 명시적 undefined 기본값으로 '미전달'을 보존한다
// (미전달 → 상태 점·라벨을 렌더하지 않는 배정 보드 맥락)
const props = withDefaults(defineProps<Props>(), { isReady: undefined })

/**
 * 완장 알파벳에서 그룹 색을 파생한다. 알파벳 한 글자가 아니면(방어) 미배정과 같이 중립 처리한다
 * — X(4색 전부 인쇄)도 단일 그룹이 없어 중립이다. 판정·클래스 맵은 team-assignment가 소유한다.
 */
const group = computed(() => displayGroup(props.team))

const GENDER_TEXT = {
  male: 'text-gender-male',
  female: 'text-gender-female',
} as const

const GENDER_LABEL = {
  male: '남성',
  female: '여성',
} as const

/** 팀 보더는 완장 표식과 같은 solid 색 — 미배정·중립은 기본 보더 */
const teamBorderClass = computed(() => groupSolidBorderClass(props.team))
const teamLabel = computed(() =>
  group.value === null ? '팀 미배정' : `완장 ${props.team} · ${GROUP_LABELS[group.value].ko}`,
)

const nameTextClass = computed(() =>
  props.gender === null ? 'text-content' : GENDER_TEXT[props.gender],
)

/** isReady가 주어졌을 때만 상태 점·라벨을 표시한다(보드 드래프트 맥락에선 상태 개념이 없다) */
const hasStatus = computed(() => props.isReady !== undefined)
const statusLabel = computed(() => (props.isReady ? '준비' : '대기'))
const statusTextClass = computed(() => (props.isReady ? 'text-success' : 'text-warning'))
const dotClass = computed(() => (props.isReady ? 'bg-success-solid' : 'bg-warning-solid'))

/**
 * 팀은 보더 색, 성별은 이름 색으로만 표시되므로(시안) 색약 대응을 위해
 * 접근성 라벨에 팀명·성별을 병기한다. 상태는 isReady가 있을 때만 덧붙인다.
 */
const ariaLabel = computed(() => {
  const genderPart = props.gender === null ? '' : ` · ${GENDER_LABEL[props.gender]}`
  const statusPart = hasStatus.value ? ` · ${statusLabel.value}` : ''
  return `${props.name}${genderPart} · ${teamLabel.value}${statusPart}`
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
    <span
      v-if="hasStatus"
      class="size-2 shrink-0 rounded-full"
      :class="dotClass"
      aria-hidden="true"
    ></span>
    <span class="truncate text-caption font-semibold" :class="nameTextClass">{{ name }}</span>
    <span
      v-if="hasStatus"
      class="ml-auto shrink-0 text-caption font-semibold"
      :class="statusTextClass"
    >
      {{ statusLabel }}
    </span>
  </div>
</template>
