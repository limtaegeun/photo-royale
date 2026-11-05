<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import type { TargetRule } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import type { JudgeDraft, JudgeIntent } from '../composables/useKillshotJudging'
import { groupTeamSections } from '../teamSections'
import JudgeCard from './JudgeCard.vue'

/**
 * 판정 대기 큐 — 참가자들이 제출한 킬샷을 오래된 순으로 카드로 나열하고, 카드에서 바로 판정한다.
 * 판정된 건은 pending 구독에서 자연히 빠진다. 대기 건수는 하단 탭 배지가 맡는다.
 */
interface Props {
  /** 판정 대기 킬샷 — 오래된 순 정렬(api가 보장) */
  submissions: Submission[]
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
  targetRule: TargetRule | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateDraft: [submissionId: string, patch: Partial<JudgeDraft>]
  approve: [submissionId: string, target: SubmissionTarget, multiplier: KillMultiplier]
  reject: [submissionId: string]
}>()

/** 타일은 알파벳 순서다 — 그룹 섹션의 순서(파랑 A·E, 주황 B·F…)대로 깔면 4열 격자에서 색이 섞인다 */
const teams = computed(() =>
  groupTeamSections(props.participants, props.assignmentRound)
    .flatMap((section) => section.teams)
    .sort((a, b) => a.armband.localeCompare(b.armband)),
)

const listRef = useTemplateRef<HTMLElement>('list')

function cardElement(submissionId: string): HTMLElement | null {
  return listRef.value?.querySelector<HTMLElement>(`[data-submission="${submissionId}"]`) ?? null
}

/** 다음에 판정할 카드 — 방금 빠진 자리를 이어받은 카드이고, 뒤에 없으면 앞의 카드다 */
function cardElementAt(index: number): HTMLElement | null {
  const cards = listRef.value?.querySelectorAll<HTMLElement>('[data-submission]')
  if (cards === undefined || cards.length === 0) return null
  return cards[Math.min(index, cards.length - 1)] ?? null
}

defineExpose({ cardElement, cardElementAt })
</script>

<template>
  <BaseCard v-if="submissions.length === 0" padding="lg">
    <div class="flex flex-col gap-2">
      <p class="text-body text-content-secondary">판정 대기 중인 킬샷이 없어요.</p>
      <p class="text-caption break-keep text-content-tertiary">
        참가자가 킬샷을 제출하면 이곳에 오래된 순으로 모여요.
      </p>
    </div>
  </BaseCard>

  <ul v-else ref="list" class="flex flex-col gap-6">
    <!-- 카드로 이동할 때 머리가 상단 상태 줄(높이 약 3.25rem + 안전 영역)에 가리지 않게 한다 -->
    <li
      v-for="submission in submissions"
      :key="submission.id"
      :data-submission="submission.id"
      tabindex="-1"
      class="scroll-mt-[calc(var(--pr-inset-top-safe)+4rem)] outline-none"
    >
      <JudgeCard
        :submission="submission"
        :participants="participants"
        :teams="teams"
        :now-ms="nowMs"
        :selected-team="draftOf(submission.id).team"
        :triple-kill="draftOf(submission.id).tripleKill"
        :judging-intent="activeJudgement?.submissionId === submission.id ? activeJudgement.intent : null"
        :locked="locked"
        :allow-triple-kill="allowTripleKill"
        :out-teams="outTeams"
        :x-teams="xTeams"
        :target-rule="targetRule"
        @update:selected-team="emit('updateDraft', submission.id, { team: $event })"
        @update:triple-kill="emit('updateDraft', submission.id, { tripleKill: $event })"
        @approve="(target, multiplier) => emit('approve', submission.id, target, multiplier)"
        @reject="emit('reject', submission.id)"
      />
    </li>
  </ul>
</template>
