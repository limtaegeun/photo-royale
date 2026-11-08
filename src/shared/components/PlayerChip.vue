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
  /**
   * 이 칩이 지금 보는 사람 자신일 때의 준비 상태(P19) — 넘기면 `나` 표시를 붙이고 보더로 상태를
   * 알린다(대기 = 점선 경고색, 준비 = 성공색). 40명 명단에서 내 칩을 바로 찾고, 아직 준비하지
   * 않았다는 것을 이름 옆에서 알게 한다. 생략하면 다른 참가자 칩이다.
   */
  selfStatus?: 'waiting' | 'ready'
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

/** 내 칩의 보더·`나` 표시 색 — 동적 클래스라 리터럴 맵으로 둔다 */
const SELF_BORDER_CLASS = {
  waiting: 'border-dashed border-warning',
  ready: 'border-success',
} as const
const SELF_TAG_CLASS = {
  waiting: 'bg-warning-solid text-on-warning',
  ready: 'bg-success-solid text-on-success',
} as const

/**
 * 팀 보더는 완장 표식과 같은 solid 색 — 미배정·중립은 기본 보더. 내 칩은 준비 상태 보더가 이긴다
 * (명단은 이번 라운드에 배정되지 않은 사람만 보는 화면이라 내 칩에 완장 색이 올 일이 없다).
 */
const borderClass = computed(() =>
  props.selfStatus === undefined
    ? groupSolidBorderClass(props.team)
    : SELF_BORDER_CLASS[props.selfStatus],
)
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
  const selfPart = props.selfStatus === undefined ? '' : ' · 나'
  return `${props.name}${selfPart}${genderPart} · ${teamLabel.value}`
})
</script>

<template>
  <div
    class="flex h-10 items-center gap-1 rounded-full border-2 pl-3"
    :class="[borderClass, selfStatus === undefined ? 'pr-3' : 'pr-1']"
    :aria-label="ariaLabel"
    :data-team="team ?? 'none'"
    :data-gender="gender ?? 'none'"
    :data-self="selfStatus ?? 'none'"
  >
    <span class="min-w-0 flex-1 truncate text-caption font-semibold" :class="nameTextClass">{{
      name
    }}</span>
    <!-- 내 칩은 오른쪽에 `나` 표시가 붙어 오른쪽 여백을 줄인다(표시가 알약 안쪽에 맞게) -->
    <span
      v-if="selfStatus !== undefined"
      class="shrink-0 rounded-full px-2 py-1 text-caption font-bold"
      :class="SELF_TAG_CLASS[selfStatus]"
      aria-hidden="true"
      >나</span
    >
  </div>
</template>
