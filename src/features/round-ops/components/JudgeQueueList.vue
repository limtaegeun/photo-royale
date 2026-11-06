<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import type { JudgeGuide, TargetRule } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import type { JudgeDraft, JudgeIntent } from '../composables/useKillshotJudging'
import { alphabeticalTeams } from '../teamSections'
import JudgeCard from './JudgeCard.vue'

/**
 * 판정 대기 큐 — 참가자들이 제출한 킬샷을 오래된 순으로 한 건씩 보여 주고 그 자리에서 판정한다.
 * 판정된 건은 pending 구독에서 자연히 빠진다. 대기 건수는 하단 탭 배지가 맡는다.
 */
interface Props {
  /** 판정 대기 킬샷 — 오래된 순 정렬(api가 보장) */
  submissions: Submission[]
  /** 지금 보고 있는 건의 순번 */
  viewedIndex: number
  /** 제출자 이름 조인용 명단 — 문서 ID=uid라 항상 찾을 수 있다(퇴장 삭제 플로우 없음) */
  participants: Participant[]
  /** 이번 라운드 차수 — 대상 팀은 이번 라운드 배정자만 나열한다(완장은 라운드 넘어 잔존) */
  assignmentRound: number
  /** 상대 시각 계산 기준 — 라운드 타이머의 1초 tick을 그대로 쓴다 */
  nowMs: number
  /** 킬샷별 선택값 — 탭을 오가도 남도록 호출부가 들고 있다 */
  draftOf: (submissionId: string) => JudgeDraft
  /** 진행 중인 쓰기 */
  activeJudgement: { submissionId: string; intent: JudgeIntent } | null
  /** 전 카드 입력 잠금 */
  locked: boolean
  allowTripleKill: boolean
  outTeams: string[]
  xTeams: string[]
  rosters: Record<string, string[]>
  hits: Record<string, number>
  targetRule: TargetRule | null
  guide: JudgeGuide | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateDraft: [submissionId: string, patch: Partial<JudgeDraft>]
  approve: [
    submissionId: string,
    target: SubmissionTarget,
    multiplier: KillMultiplier,
    toast: string | null,
  ]
  reject: [submissionId: string]
  view: [position: number]
}>()

const viewed = computed(() => props.submissions[props.viewedIndex] ?? null)

const teams = computed(() => alphabeticalTeams(props.participants, props.assignmentRound))

const cardRef = useTemplateRef<HTMLElement>('card')

/**
 * 누른 버튼이 카드와 함께 사라지면 포커스가 페이지 밖으로 빠진다. 키보드·낭독기 사용자가 처음부터 다시
 * 찾지 않게 다음 건으로 옮긴다.
 */
function focusViewedCard() {
  cardRef.value?.focus({ preventScroll: true })
}

defineExpose({ focusViewedCard })
</script>

<template>
  <BaseCard v-if="viewed === null" padding="lg">
    <div class="flex flex-col gap-2">
      <p class="text-body text-content-secondary">판정 대기 중인 킬샷이 없어요.</p>
      <p class="text-caption break-keep text-content-tertiary">
        참가자가 킬샷을 제출하면 이곳에 오래된 순으로 모여요.
      </p>
    </div>
  </BaseCard>

  <div
    v-else
    :key="viewed.id"
    ref="card"
    :data-submission="viewed.id"
    tabindex="-1"
    class="flex min-h-0 flex-1 flex-col outline-none"
  >
    <JudgeCard
      :submission="viewed"
      :participants="participants"
      :teams="teams"
      :now-ms="nowMs"
      :selected-team="draftOf(viewed.id).team"
      :triple-kill="draftOf(viewed.id).tripleKill"
      :judging-intent="activeJudgement?.submissionId === viewed.id ? activeJudgement.intent : null"
      :locked="locked"
      :allow-triple-kill="allowTripleKill"
      :out-teams="outTeams"
      :x-teams="xTeams"
      :rosters="rosters"
      :hits="hits"
      :target-rule="targetRule"
      :guide="guide"
      :position="viewedIndex"
      :total="submissions.length"
      @update:selected-team="emit('updateDraft', viewed!.id, { team: $event })"
      @update:triple-kill="emit('updateDraft', viewed!.id, { tripleKill: $event })"
      @approve="(target, multiplier, toast) => emit('approve', viewed!.id, target, multiplier, toast)"
      @reject="emit('reject', viewed!.id)"
      @move="emit('view', $event)"
    />
  </div>
</template>
