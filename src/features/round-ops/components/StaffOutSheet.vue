<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { livesOf } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import { groupTeamSections, type TeamPickOption, type TeamPickSection, type TeamSectionTeam } from '../teamSections'
import TeamPickList from './TeamPickList.vue'

/**
 * 스태프 아웃 처리 시트(P07 §4.5) — 스태프에게 잡힌 팀을 진행자가 직접 골라 원장에 기록한다.
 * 판정 시트(JudgeSheet)의 팀 목록·그룹 섹션 패턴을 그대로 따르되, 제출자·모드 대상 제한 개념이
 * 없어(스태프는 참가자가 아니다) 이미 탈락한 팀만 선택을 막는다.
 */
interface Props {
  /** 대상 팀 목록 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 차수 — 이번 라운드 배정자만 나열한다 */
  assignmentRound: number
  /** 이미 탈락한 팀 완장(P07 M3) — 또 아웃 처리할 수 없어 선택을 막는다 */
  outTeams: string[]
  /** 원장의 팀 편성(완장 → uid) — 1인 팀 여부·라이프 계산에 쓴다 */
  teams: Record<string, string[]>
  /** 원장의 팀별 피격 집계 — 남은 목숨 계산에 쓴다 */
  hits: Record<string, number>
  /** 아웃 처리 쓰기 진행 중 — 확정 버튼에 로딩을 주고 선택을 잠근다 */
  marking: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 아웃 확정 — 스태프에게 잡힌 팀 완장 */
  confirm: [armband: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const selected = ref<string | null>(null)

// 시트가 닫히면 선택을 비운다 — 다음에 열었을 때 이전 선택이 새 판단에 묻어가지 않게
watch(open, (isOpen) => {
  if (!isOpen) selected.value = null
})

/**
 * 팀 하나에 탈락 배지·1인 팀 캡션을 얹는다 — 판정 시트와 달리 둘 다 서로 독립이라(한 팀이
 * 탈락하면서 동시에 1인 팀일 수 있다) 배지·캡션을 각자 조건으로 판단한다.
 */
function decorate(team: TeamSectionTeam): TeamPickOption {
  const isOut = props.outTeams.includes(team.armband)
  const isSolo = (props.teams[team.armband]?.length ?? 0) === 1
  return {
    ...team,
    disabled: isOut,
    badge: isOut ? { text: '탈락', tone: 'danger', appearance: 'outline' } : undefined,
    caption: isSolo
      ? `1인 팀 · 목숨 ${livesOf(props.teams, team.armband) - (props.hits[team.armband] ?? 0)}`
      : undefined,
  }
}

/** 이번 라운드 팀을 그룹 섹션으로 나누고 선택 가능 여부·배지를 얹는다 */
const sections = computed<TeamPickSection[]>(() => {
  const base = groupTeamSections(props.participants, props.assignmentRound)
  return base.map((section) => ({ ...section, teams: section.teams.map((team) => decorate(team)) }))
})
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="스태프 아웃 처리" :dismissible="!marking">
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-3">
        <div>
          <h3 class="text-label text-content">잡힌 팀 선택</h3>
          <p class="mt-1 text-caption break-keep text-content-secondary">
            스태프에게 잡힌 팀을 골라 주세요. 아웃 처리하면 되돌릴 수 없어요.
          </p>
        </div>

        <TeamPickList
          :sections="sections"
          :selected="selected"
          :locked="marking"
          @select="(option) => (selected = option.armband)"
        />
      </div>

      <BaseButton
        variant="danger"
        size="lg"
        class="w-full"
        :disabled="selected === null || marking"
        :loading="marking"
        @click="emit('confirm', selected!)"
      >
        아웃 확정
      </BaseButton>
    </div>
  </BaseBottomSheet>
</template>
