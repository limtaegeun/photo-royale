<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseSwitch from '@/shared/components/BaseSwitch.vue'
import {
  GROUP_LABELS,
  TEAM_GROUP_ORDER,
  displayGroup,
  groupSolidBgClass,
  groupTextClass,
  type TeamGroup,
} from '@/features/team-assignment'
import { isAssignedInRound, type Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import KillshotPhotoHeader from './KillshotPhotoHeader.vue'
import { participantName } from '../submissionDisplay'

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
}

const props = withDefaults(defineProps<Props>(), { allowTripleKill: false, outTeams: () => [] })

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

interface TeamOption {
  armband: string
  /** 팀원 이름 나열 — 완장만으로는 현장에서 누구인지 떠올리기 어렵다 */
  memberNames: string
  /** Rules가 이 참가자 문서로 현재 라운드의 실제 팀인지 검증한다 */
  participantUid: string
  /** 제출자 본인 팀 — 자기 팀을 잡았다는 판정은 성립하지 않아 비활성화한다 */
  isSubmitterTeam: boolean
  /** 이미 탈락한 팀 — 또 잡은 판정은 성립하지 않아 비활성화한다(P07 M3) */
  isOut: boolean
}

interface GroupSection {
  group: TeamGroup
  label: string
  /** 그룹 제목 색 — 첫 팀 완장에서 파생(섹션은 팀이 있을 때만 존재한다) */
  textClass: string
  teams: TeamOption[]
}

/** 이번 라운드 배정 팀을 그룹 색 순서(파랑→주황→초록→빨강)로 섹션화한다 */
const groupSections = computed<GroupSection[]>(() => {
  const membersByTeam = new Map<string, { names: string[]; participantUid: string }>()
  for (const participant of props.participants) {
    if (!isAssignedInRound(participant, props.assignmentRound) || participant.team === null) {
      continue
    }
    const members = membersByTeam.get(participant.team) ?? {
      names: [],
      participantUid: participant.id,
    }
    members.names.push(participant.name)
    membersByTeam.set(participant.team, members)
  }

  return TEAM_GROUP_ORDER.map((group) => {
    const teams = [...membersByTeam.entries()]
      .filter(([armband]) => displayGroup(armband) === group)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([armband, members]) => ({
        armband,
        memberNames: members.names.join(' · '),
        participantUid: members.participantUid,
        isSubmitterTeam: armband === props.submission?.team,
        isOut: props.outTeams.includes(armband),
      }))
    const firstTeam = teams[0]
    return {
      group,
      label: GROUP_LABELS[group].ko,
      textClass: firstTeam === undefined ? '' : groupTextClass(firstTeam.armband),
      teams,
    }
  }).filter((section) => section.teams.length > 0)
})

const submitterName = computed(() => participantName(props.participants, props.submission?.uid))

/**
 * 옵션 행 상태별 클래스 — 보더 "폭"은 어느 상태에서도 1px로 고정하고 색만 바꾼다
 * (GameModePicker와 같은 이유: 선택을 옮길 때 행 높이가 흔들리지 않게).
 */
const OPTION_CLASS = {
  disabled: 'border border-stroke',
  selected: 'border border-accent bg-surface',
  selectable: 'border border-stroke-strong',
} as const

function optionClass(option: TeamOption): string {
  if (option.isSubmitterTeam || option.isOut) return OPTION_CLASS.disabled
  return selectedTarget.value?.team === option.armband
    ? OPTION_CLASS.selected
    : OPTION_CLASS.selectable
}

function chooseTeam(option: TeamOption) {
  if (option.isSubmitterTeam || option.isOut || props.judging) return
  selectedTarget.value = { team: option.armband, participantUid: option.participantUid }
}

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

        <section
          v-for="section in groupSections"
          :key="section.group"
          class="flex flex-col gap-2"
        >
          <h4 class="text-caption" :class="section.textClass">{{ section.label }} 그룹</h4>
          <ul class="flex flex-col gap-2">
            <li v-for="option in section.teams" :key="option.armband">
              <button
                type="button"
                :data-team="option.armband"
                :aria-pressed="selectedTarget?.team === option.armband"
                :disabled="option.isSubmitterTeam || option.isOut || judging"
                :aria-disabled="option.isSubmitterTeam || option.isOut || judging"
                class="flex min-h-(--pr-size-control-md) w-full items-center gap-3 rounded-md
                       px-4 py-2 text-left transition-colors duration-100 ease-standard
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                       disabled:cursor-default"
                :class="optionClass(option)"
                @click="chooseTeam(option)"
              >
                <!-- 그룹 색 표식 — 의미는 옆의 완장·그룹 텍스트가 함께 전달한다 -->
                <span
                  aria-hidden="true"
                  class="size-3 shrink-0 rounded-full"
                  :class="groupSolidBgClass(option.armband)"
                ></span>
                <span
                  class="shrink-0 text-label"
                  :class="option.isSubmitterTeam || option.isOut ? 'text-content-disabled' : 'text-content'"
                >
                  팀 {{ option.armband }}
                </span>
                <span
                  class="min-w-0 flex-1 truncate text-caption"
                  :class="option.isSubmitterTeam || option.isOut ? 'text-content-disabled' : 'text-content-secondary'"
                >
                  {{ option.memberNames }}
                </span>
                <BaseBadge v-if="option.isSubmitterTeam" tone="neutral" class="shrink-0">
                  제출 팀
                </BaseBadge>
                <BaseBadge v-else-if="option.isOut" tone="danger" appearance="outline" class="shrink-0">
                  탈락
                </BaseBadge>
              </button>
            </li>
          </ul>
        </section>
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
