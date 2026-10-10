<!--
  대기실 명단·배정 보드가 공유하는 참가자 표시 칩.
  성별은 이름 색(남 파랑·여 빨강), 팀은 보더 색으로 표기하고,
  색약 대응으로 접근성 라벨에 성별·팀 텍스트를 병기한다.
  준비 상태는 칩에 싣지 않는다 — 대기실 명단이 대기·준비 묶음 제목으로 표시한다(이름 칸 확보).
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Gender } from '@/features/auth'
import { GROUP_LABELS } from '@/features/game-mode'
import { displayGroup, groupSolidBorderClass } from '@/features/team-assignment'

interface Props {
  name: string
  /** 배정된 완장 알파벳(그룹 색은 완장에서 파생). null이면 미배정 — 중립 보더로 표시한다 */
  team: string | null
  /** 성별 — 이름 색으로 표기(남 파랑·여 빨강). null이면 기본 텍스트 색 */
  gender: Gender | null
}

const props = defineProps<Props>()

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

/**
 * 팀은 보더 색, 성별은 이름 색으로만 표시되므로(시안) 색약 대응을 위해
 * 접근성 라벨에 팀명·성별을 병기한다.
 */
const ariaLabel = computed(() => {
  const genderPart = props.gender === null ? '' : ` · ${GENDER_LABEL[props.gender]}`
  return `${props.name}${genderPart} · ${teamLabel.value}`
})
</script>

<template>
  <div
    class="flex h-10 items-center rounded-full border-2 px-3"
    :class="teamBorderClass"
    :aria-label="ariaLabel"
    :data-team="team ?? 'none'"
    :data-gender="gender ?? 'none'"
  >
    <span class="truncate text-caption font-semibold" :class="nameTextClass">{{ name }}</span>
  </div>
</template>
