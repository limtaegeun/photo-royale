<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseSwitch from '@/shared/components/BaseSwitch.vue'
import type { TargetContext, TargetRule } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import { participantName } from '../submissionDisplay'
import { groupTeamSections, type TeamPickOption, type TeamPickSection, type TeamSectionTeam } from '../teamSections'
import KillshotPhotoHeader from './KillshotPhotoHeader.vue'
import TeamPickList from './TeamPickList.vue'

/**
 * 킬샷 판정 시트 — 사진을 크게 확인하고 "사진 속 완장이 어떤 팀·그룹인지"를 선택해 확정하거나,
 * 사유 없이 반려한다(확정 스펙: 반려 사유 선택 없음). 실제 쓰기는 호출부(store) 책임이고
 * 여기서는 선택 상태와 두 액션 이벤트만 다룬다.
 */
interface Props {
  /** 판정할 킬샷 — 시트가 닫혀 있으면 null일 수 있다 */
  submission: Submission | null
  /** 대상 팀 목록·제출자 이름 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 차수 — 대상 팀은 이번 라운드 배정자만 나열한다(완장은 라운드 넘어 잔존) */
  assignmentRound: number
  /** 판정 쓰기 진행 중 — 눌린 버튼에만 로딩을 주고 나머지 조작을 잠근다 */
  judging: boolean
  /** 상대 시각 계산 기준 */
  nowMs: number
  /**
   * 낙오 포착(3배) 토글 노출 — 일반전에서만 true. 기획서 §3.1의 "낙오(팀원과 2m 이탈) 포착 킬 3배"는
   * 일반전 규정이고, 사진으로 거리를 판별할 수 없어 호스트가 판정 시트에서 정한다(P07 M2).
   */
  allowTripleKill?: boolean
  /**
   * 이미 탈락한 팀 완장(P07 M3) — 맞은 횟수가 라이프에 닿은 팀. 또 잡았다는 판정은 점수도 상태도
   * 바꾸지 않으므로 선택을 막고 배지로 알린다. 원장이 없는 라운드면 빈 배열.
   */
  outTeams?: string[]
  /**
   * 모드의 대상 제한(P07 M4) — 제출 팀이 잡을 수 없는 팀(그룹전의 같은 그룹 동맹, 꼬리잡기의 다음
   * 알파벳이 아닌 팀)을 비활성화하고 이유 배지를 붙인다. 제한이 없는 모드면 null.
   */
  targetRule?: TargetRule | null
}

const props = withDefaults(defineProps<Props>(), {
  allowTripleKill: false,
  outTeams: () => [],
  targetRule: null,
})

const emit = defineEmits<{
  /** 판정 확정 — 사진 속 완장의 팀과 킬 배율(낙오 포착이면 3) */
  approve: [target: SubmissionTarget, multiplier: KillMultiplier]
  /** 반려 — 사유 없음 */
  reject: []
}>()

const open = defineModel<boolean>('open', { default: false })

const selectedTarget = ref<SubmissionTarget | null>(null)
/** 낙오 포착 토글 — 킬샷마다 새로 정한다(기본 일반 킬). 노출되지 않는 모드에서는 무시된다 */
const isTripleKill = ref(false)
/** 확정/반려 중 어느 버튼이 눌렸는지 — 진행 표시를 눌린 버튼에만 준다 */
const lastIntent = ref<'approve' | 'reject' | null>(null)

// 다른 킬샷으로 넘어가면 이전 선택이 새 판정에 묻어가지 않게 초기화한다
watch(
  () => props.submission?.id,
  () => {
    selectedTarget.value = null
    isTripleKill.value = false
    lastIntent.value = null
  },
)

/**
 * 팀 하나에 선택 가능 여부·배지를 얹는다 — 제출 팀 > 탈락 > 모드 대상 제한 순으로 확인하고
 * 먼저 걸리는 사유 하나만 배지로 보인다(오늘까지의 v-if/v-else-if 우선순위와 동일).
 */
function decorate(team: TeamSectionTeam, targetContext: TargetContext): TeamPickOption {
  if (team.armband === props.submission?.team) {
    return { ...team, disabled: true, badge: { text: '제출 팀', tone: 'neutral' } }
  }
  if (props.outTeams.includes(team.armband)) {
    return { ...team, disabled: true, badge: { text: '탈락', tone: 'danger', appearance: 'outline' } }
  }
  const targetRule = props.targetRule
  if (
    targetRule !== null &&
    props.submission !== null &&
    !targetRule.canTarget(props.submission.team, team.armband, targetContext)
  ) {
    return {
      ...team,
      disabled: true,
      badge: { text: targetRule.blockedBadge, tone: 'neutral', appearance: 'outline' },
    }
  }
  return { ...team, disabled: false }
}

/** 이번 라운드 팀을 그룹 섹션으로 나누고 선택 가능 여부·배지를 얹는다 */
const sections = computed<TeamPickSection[]>(() => {
  const base = groupTeamSections(props.participants, props.assignmentRound)
  const targetContext = { teams: base.flatMap((s) => s.teams.map((t) => t.armband)), outTeams: props.outTeams }
  return base.map((section) => ({ ...section, teams: section.teams.map((team) => decorate(team, targetContext)) }))
})

const submitterName = computed(() => participantName(props.participants, props.submission?.uid))

function handleApprove() {
  if (selectedTarget.value === null) return
  lastIntent.value = 'approve'
  emit('approve', selectedTarget.value, props.allowTripleKill && isTripleKill.value ? 3 : 1)
}

function handleReject() {
  lastIntent.value = 'reject'
  emit('reject')
}
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="킬샷 판정" :dismissible="!judging">
    <div v-if="submission" class="flex flex-col gap-5">
      <KillshotPhotoHeader
        :photo="submission.photo"
        photo-alt="판정할 킬샷"
        :team="submission.team"
        :submitter-name="submitterName"
        :created-at-ms="submission.createdAtMs"
        :now-ms="nowMs"
      />

      <div class="flex flex-col gap-3">
        <div>
          <h3 class="text-label text-content">잡힌 팀 선택</h3>
          <p class="mt-1 text-caption break-keep text-content-secondary">
            사진 속 완장이 어떤 팀·그룹인지 선택해 주세요. 확정하면 되돌릴 수 없어요.
          </p>
        </div>

        <TeamPickList
          :sections="sections"
          :selected="selectedTarget?.team ?? null"
          :locked="judging"
          @select="(option) => (selectedTarget = { team: option.armband, participantUid: option.participantUid })"
        />
      </div>

      <!-- 낙오 포착(3배) — 일반전에서만. 보이는 텍스트가 라벨이라 스위치 aria-label도 같은 문구 -->
      <div
        v-if="allowTripleKill"
        class="flex items-center justify-between gap-4 rounded-md border border-stroke bg-surface px-4 py-3"
      >
        <div class="min-w-0">
          <p class="text-label text-content">낙오 포착 킬 (3배)</p>
          <p class="mt-1 text-caption break-keep text-content-secondary">
            팀원과 2m 넘게 떨어진 사람을 찍었으면 켜 주세요. 10점 대신 30점이에요.
          </p>
        </div>
        <BaseSwitch
          v-model="isTripleKill"
          label="낙오 포착 킬 (3배)"
          :disabled="judging"
          data-testid="triple-kill-switch"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <BaseButton
          variant="danger"
          size="lg"
          class="w-full"
          :disabled="judging && lastIntent !== 'reject'"
          :loading="judging && lastIntent === 'reject'"
          @click="handleReject"
        >
          반려
        </BaseButton>
        <BaseButton
          variant="primary"
          size="lg"
          class="w-full"
          :disabled="selectedTarget === null || (judging && lastIntent !== 'approve')"
          :loading="judging && lastIntent === 'approve'"
          @click="handleApprove"
        >
          판정 확정
        </BaseButton>
      </div>
    </div>
  </BaseBottomSheet>
</template>
