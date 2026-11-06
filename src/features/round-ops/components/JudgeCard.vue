<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseSwitch from '@/shared/components/BaseSwitch.vue'
import type { JudgeContext, JudgeGuide, TargetRule } from '@/features/game-mode'
import {
  groupOnSolidTextClass,
  groupSolidBgClass,
  groupTextClass,
} from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import { useIsTallScreen } from '../composables/useIsTallScreen'
import type { JudgeIntent } from '../composables/useKillshotJudging'
import { OUT_TEAM_REASON, SUBMITTING_TEAM_REASON, exclusionLine } from '../judgeExclusion'
import { formatRelativeTime } from '../relativeTime'
import { participantName, teamChipLabel } from '../submissionDisplay'
import type { DialTeam, TeamSectionTeam } from '../teamSections'
import KillshotStage from './KillshotStage.vue'
import TeamDial from './TeamDial.vue'

/**
 * 킬샷 판정 화면 — 한 번에 한 건을 사진과 드럼 다이얼로 판정한다. 사진을 보고 완장의 팀을 돌려 고른 뒤
 * 확정하거나, 사유 없이 반려한다(확정 스펙: 반려 사유 선택 없음). 실제 쓰기는 호출부 책임이고 여기서는 표시와
 * 고르기만 다룬다.
 */
interface Props {
  submission: Submission
  /** 제출자 이름 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 팀 — 알파벳 순서로 받아 다이얼에 깐다 */
  teams: TeamSectionTeam[]
  /** 상대 시각 계산 기준 */
  nowMs: number
  /** 고른 팀 완장 — 탭을 오가도 남도록 호출부가 들고 있다 */
  selectedTeam: string | null
  tripleKill: boolean
  /** 이 카드에서 진행 중인 쓰기 — 눌린 버튼에만 로딩을 준다 */
  judgingIntent: JudgeIntent | null
  /** 전 카드 입력 잠금(다른 카드의 쓰기 중, 판정 직후 연타 방지) */
  locked: boolean
  /**
   * 낙오 포착(3배) 토글 노출 — 일반전에서만 true. 기획서 §3.1의 "낙오(팀원과 2m 이탈) 포착 킬 3배"는
   * 일반전 규정이고, 사진으로 거리를 판별할 수 없어 호스트가 정한다(P07 M2).
   */
  allowTripleKill: boolean
  /**
   * 이미 탈락한 팀 완장(P07 M3) — 맞은 횟수가 라이프에 닿은 팀. 또 잡았다는 판정은 점수도 상태도
   * 바꾸지 않으므로 다이얼에서 뺀다. 원장이 없는 라운드면 빈 배열.
   */
  outTeams: string[]
  /**
   * 특수 완장 X를 겸한 팀 완장(편성 스냅샷) — 일반전의 "X끼리만 사냥" 대상 제한 근거. X를 끈 라운드나
   * 원장이 없는 라운드면 빈 배열.
   */
  xTeams: string[]
  /** 원장의 편성·피격 — 이 킬로 팀이 아웃되는지 안내할 때 쓴다. 원장이 없는 라운드면 빈 객체 */
  rosters: Record<string, string[]>
  hits: Record<string, number>
  /**
   * 모드의 대상 제한(P07 M4) — 제출 팀이 잡을 수 없는 팀(그룹전의 같은 그룹 동맹, 꼬리잡기의 다음
   * 알파벳이 아닌 팀, 일반전의 X 여부가 다른 팀)을 다이얼에서 빼고 이유를 보인다. 제한이 없는 모드면 null.
   */
  targetRule: TargetRule | null
  /** 모드별 안내 문구 — 없으면 기본 문구 */
  guide: JudgeGuide | null
  /** 대기 큐에서 이 건의 순번(0부터)과 전체 건수 */
  position: number
  total: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:selectedTeam': [team: string | null]
  'update:tripleKill': [tripleKill: boolean]
  /** 판정 확정 — 사진 속 완장의 팀, 킬 배율(낙오 포착이면 3), 모드가 정한 토스트 */
  approve: [target: SubmissionTarget, multiplier: KillMultiplier, toast: string | null]
  /** 반려 — 사유 없음 */
  reject: []
  /** 이전·다음 킬샷으로 넘긴다 */
  move: [position: number]
}>()

const isTall = useIsTallScreen()
/** 다이얼이 돌아가는 동안은 확정할 수 없다 — 멈춘 줄을 눈으로 보고 누르게 한다 */
const isDialMoving = ref(false)

const context = computed<JudgeContext>(() => ({
  teams: props.teams.map((team) => team.armband),
  outTeams: props.outTeams,
  xTeams: props.xTeams,
  rosters: props.rosters,
  hits: props.hits,
}))

/** 팀을 고를 수 없는 이유 — 제출 팀 > 탈락 > 모드 대상 제한 순으로 먼저 걸리는 하나만 친다 */
function blockReasonOf(armband: string): string | null {
  if (armband === props.submission.team) return SUBMITTING_TEAM_REASON
  if (props.outTeams.includes(armband)) return OUT_TEAM_REASON
  const rule = props.targetRule
  if (rule === null) return null
  return rule.canTarget(props.submission.team, armband, context.value) ? null : rule.blockedBadge
}

function markOf(armband: string) {
  return props.guide?.teamMark?.(armband, context.value) ?? null
}

const dialTeams = computed<DialTeam[]>(() =>
  props.teams
    .filter((team) => blockReasonOf(team.armband) === null)
    .map((team) => ({ ...team, mark: markOf(team.armband) })),
)

const dialHint = computed(() =>
  dialTeams.value.length === 0
    ? '고를 수 있는 팀이 없어요'
    : (props.guide?.dialHint ?? '돌려서 팀 고르기'),
)

/**
 * 고른 팀은 지금도 고를 수 있을 때만 유효하다. 골라 둔 뒤 다른 판정으로 그 팀이 탈락하면(꼬리잡기는
 * 대상도 바뀐다) 남은 선택으로 확정되지 않게 선택 없음으로 돌아간다.
 */
const pickedTeam = computed(
  () => dialTeams.value.find((team) => team.armband === props.selectedTeam) ?? null,
)
const readyTeam = computed(() => (isDialMoving.value ? null : pickedTeam.value))

const isTripleApplied = computed(() => props.allowTripleKill && props.tripleKill)

const outcome = computed(() =>
  pickedTeam.value === null
    ? null
    : (props.guide?.outcome?.(props.submission.team, pickedTeam.value.armband, context.value) ?? null),
)

const approveLabel = computed(() => {
  if (readyTeam.value === null) return '판정 확정'
  if (outcome.value?.approveLabel !== undefined) return outcome.value.approveLabel
  return isTripleApplied.value
    ? `팀 ${readyTeam.value.armband} 3배 판정 확정`
    : `팀 ${readyTeam.value.armband} 판정 확정`
})

const exclusionText = computed(() => {
  const attacker = props.submission.team
  const summary = props.guide?.exclusionSummary?.(attacker, context.value)
  if (summary !== undefined) return summary
  const excluded = props.teams.flatMap((team) => {
    const reason = blockReasonOf(team.armband)
    return reason === null ? [] : [{ armband: team.armband, reason }]
  })
  return exclusionLine(excluded, (reason) =>
    reason === props.targetRule?.blockedBadge
      ? (props.guide?.exclusionLabel?.(attacker, context.value) ?? reason)
      : reason,
  )
})
const outcomeNote = computed(() => (readyTeam.value === null ? null : (outcome.value?.note ?? null)))

const submitterName = computed(() => participantName(props.participants, props.submission.uid))
const submitterMark = computed(() => markOf(props.submission.team))

/** 닉네임은 최대 12자다 — 넘치면 역할 글자 크기를 차례로 줄여 이름이 잘리지 않게 한다 */
const SUBMITTER_FONT_SIZES = ['--pr-font-size-17', '--pr-font-size-15', '--pr-font-size-13']
const submitterRef = useTemplateRef<HTMLElement>('submitter')
onMounted(() => {
  const name = submitterRef.value
  if (name === null) return
  for (const size of SUBMITTER_FONT_SIZES) {
    name.style.fontSize = `var(${size})`
    if (name.scrollWidth <= name.clientWidth) break
  }
})

function handleApprove() {
  const picked = readyTeam.value
  if (picked === null) return
  emit(
    'approve',
    { team: picked.armband, participantUid: picked.participantUid },
    isTripleApplied.value ? 3 : 1,
    outcome.value?.toast ?? null,
  )
}
</script>

<template>
  <article
    class="judge-card flex min-h-0 flex-1 flex-col gap-2"
    :aria-label="`${submitterName}의 킬샷 판정`"
  >
    <header class="flex h-13 shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        class="flex size-10 shrink-0 items-center justify-center rounded-md text-subheading font-bold"
        :class="[groupSolidBgClass(submission.team), groupOnSolidTextClass(submission.team)]"
      >
        {{ submission.team }}
      </span>
      <div class="flex min-w-0 flex-1 flex-col">
        <span
          ref="submitter"
          data-testid="submitter-name"
          class="truncate text-body leading-(--pr-line-height-tight) font-semibold text-content"
        >
          {{ submitterName }}
        </span>
        <span class="truncate text-caption text-content-tertiary">
          <span class="font-semibold" :class="groupTextClass(submission.team)">{{ teamChipLabel(submission.team) }}</span>
          <span v-if="submitterMark !== null" class="font-semibold text-content"> {{ submitterMark }}</span>
          {{ formatRelativeTime(submission.createdAtMs, nowMs) }} 제출
        </span>
      </div>
      <!-- 오른쪽 버튼은 화면 여백으로 조금 내보낸다 — 48px 터치 영역을 지키면서 이름 자리를 남긴다 -->
      <nav aria-label="killshot pager" class="-mr-3 flex shrink-0 items-center">
        <button
          type="button"
          aria-label="previous killshot"
          data-testid="pager-previous"
          :disabled="position === 0"
          class="flex size-12 items-center justify-center text-content-secondary touch-manipulation
                 disabled:cursor-default disabled:text-content-disabled
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          @click="emit('move', position - 1)"
        >
          <svg aria-hidden="true" class="size-4" viewBox="0 0 16 16" fill="none">
            <path d="M10 3 5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span data-testid="pager-count" class="text-caption font-semibold text-content-secondary tabular-nums">
          {{ position + 1 }}/{{ total }}
        </span>
        <button
          type="button"
          aria-label="next killshot"
          data-testid="pager-next"
          :disabled="position === total - 1"
          class="flex size-12 items-center justify-center text-content-secondary touch-manipulation
                 disabled:cursor-default disabled:text-content-disabled
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          @click="emit('move', position + 1)"
        >
          <svg aria-hidden="true" class="size-4" viewBox="0 0 16 16" fill="none">
            <path d="m6 3 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </nav>
    </header>

    <!-- 다이얼 5줄(높이 220) 위로 사진이 남는 자리를 다 쓴다. 낮은 화면은 사진을 쌓을 자리가 없어 좌우로 놓고, 폭에 비례해 나눠 좁은 폰에서도 이름 자리를 남긴다 -->
    <div
      class="grid min-h-0 flex-1 gap-2"
      :class="
        isTall
          ? 'grid-rows-[minmax(0,1fr)_13.75rem]'
          : 'grid-cols-[minmax(0,44%)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]'
      "
    >
      <KillshotStage :photo="submission.photo" alt="판정할 킬샷" />
      <TeamDial
        v-model:moving="isDialMoving"
        :model-value="pickedTeam?.armband ?? null"
        :teams="dialTeams"
        :hint="dialHint"
        :density="isTall ? 'compact' : 'roomy'"
        :locked="locked"
        @update:model-value="emit('update:selectedTeam', $event)"
      />
    </div>

    <div class="flex min-h-10 shrink-0 items-center gap-2">
      <p
        data-testid="judge-exclusion"
        class="min-w-0 flex-1 text-caption leading-[1.125rem] break-keep"
        :class="outcomeNote === null ? 'text-content-tertiary' : 'text-content'"
      >
        {{ outcomeNote ?? exclusionText }}
      </p>
      <span v-if="allowTripleKill" class="flex shrink-0 items-center gap-1">
        <span class="text-caption text-content-secondary">낙오 3배</span>
        <BaseSwitch
          :model-value="tripleKill"
          label="낙오 포착 킬 (3배)"
          :disabled="locked"
          data-testid="triple-kill-switch"
          @update:model-value="emit('update:tripleKill', $event)"
        />
      </span>
    </div>

    <footer class="flex shrink-0 gap-3">
      <BaseButton
        variant="neutral"
        size="lg"
        padding="compact"
        class="reject-button w-24"
        :disabled="locked && judgingIntent !== 'reject'"
        :loading="judgingIntent === 'reject'"
        @click="emit('reject')"
      >
        반려
      </BaseButton>
      <BaseButton
        variant="primary"
        size="lg"
        padding="compact"
        class="min-w-0 flex-1"
        :disabled="readyTeam === null || (locked && judgingIntent !== 'approve')"
        :loading="judgingIntent === 'approve'"
        @click="handleApprove"
      >
        {{ approveLabel }}
      </BaseButton>
    </footer>
  </article>
</template>

<style scoped>
/* 다음 건이 옆에서 들어온다 — 판정이 끝나고 화면이 바뀌었다는 걸 보여 준다 */
.judge-card {
  animation: judge-card-in var(--pr-duration-base) var(--pr-easing-decelerate);
}
@keyframes judge-card-in {
  from {
    opacity: 0;
    transform: translateX(1rem);
  }
}
/* 빨간 글자 대비(4.5:1)를 지키려고 neutral 채움보다 어두운 면을 깐다. 비활성은 공용 스타일을 따른다 */
.reject-button:not(:disabled) {
  background-color: var(--pr-color-bg-surface);
  color: var(--pr-color-text-danger);
}
.reject-button:not(:disabled):active {
  background-color: var(--pr-color-bg-surface-strong);
}
</style>
