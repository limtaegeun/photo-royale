<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import { displayGroup } from '@/features/team-assignment'
import { isAssignedInRound, type Participant } from '@/features/waiting-room'
import type { SubmissionRecord, SubmissionStatus } from '../api/submissions'
import KillshotPhotoHeader from './KillshotPhotoHeader.vue'
import { RECORD_STATUS_LABEL, RECORD_STATUS_TONE } from '../recordStatusStyles'
import { formatRelativeTime } from '../relativeTime'
import { participantName, teamChipLabel } from '../submissionDisplay'

/**
 * 기록 상세 시트 — 리스트 썸네일로는 사진 속 완장을 확인하기 어려워 사진을 크게 보여주고,
 * 판정 결과(확정이면 잡힌 팀)를 함께 남긴다. 읽기 전용이며 판정 액션은 없다 — 대기 건의
 * 판정은 호출부가 판정 시트(JudgeSheet)로 보낸다.
 */
interface Props {
  /** 확인할 기록 — 시트가 닫혀 있으면 null일 수 있다 */
  record: SubmissionRecord | null
  /** 제출자 이름·팀원 구성 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 차수 — 팀원 구성은 이번 라운드 배정자만 유효하다(완장은 라운드 넘어 잔존) */
  assignmentRound: number
  /** 상대 시각 계산 기준 */
  nowMs: number
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const submitterName = computed(() => participantName(props.participants, props.record?.uid))

/**
 * 지난 라운드 기록인지 — 팀 구성은 참가자 문서의 현재 배정만 남아 있어(라운드별 편성 이력을
 * 저장하지 않는다) 이번 라운드 기록에만 팀원을 붙일 수 있다.
 */
const isPastRound = computed(
  () => props.record !== null && props.record.round !== props.assignmentRound,
)

/** 이번 라운드 배정자만 완장별로 모은다 — 미배정 대기자의 잔존 완장이 섞이지 않게 한다 */
const memberNamesByTeam = computed(() => {
  const byTeam = new Map<string, string[]>()
  if (isPastRound.value) return byTeam
  for (const participant of props.participants) {
    if (!isAssignedInRound(participant, props.assignmentRound) || participant.team === null) {
      continue
    }
    byTeam.set(participant.team, [...(byTeam.get(participant.team) ?? []), participant.name])
  }
  return byTeam
})

/** 팀원 이름 나열 — 완장만으로는 현장에서 누구인지 떠올리기 어렵다(JudgeSheet와 같은 표기) */
function memberNames(team: string): string {
  return (memberNamesByTeam.value.get(team) ?? []).join(' · ')
}

/**
 * 상태별 보조 설명 — 확정은 잡힌 팀 배지가 정보를 전달하므로 나머지 두 상태만 문장이 필요하다.
 * 이번 라운드의 대기 건은 호출부가 판정 시트로 보내므로, 여기 오는 대기 건은 판정되지 않은 채
 * 라운드가 지난 제출뿐이다(rules가 지난 라운드 판정을 막는다). approved는 키가 없다 —
 * Partial이라 타입이 그 사실을 그대로 드러낸다.
 */
const STATUS_DESCRIPTION: Partial<Record<SubmissionStatus, string>> = {
  pending: '판정되지 않은 채 라운드가 지난 제출이에요.',
  rejected: '킬로 인정되지 않은 제출이에요.',
}
</script>

<template>
  <BaseBottomSheet
    v-model:open="open"
    title="킬샷 기록"
    :description="record === null ? undefined : `라운드 ${record.round}`"
  >
    <div v-if="record" class="flex flex-col gap-5">
      <KillshotPhotoHeader
        :photo="record.photo"
        photo-alt="제출된 킬샷"
        :team="record.team"
        :submitter-name="submitterName"
        :created-at-ms="record.createdAtMs"
        :now-ms="nowMs"
      >
        <p
          v-if="memberNames(record.team) !== ''"
          class="text-caption break-keep text-content-secondary"
        >
          팀원 {{ memberNames(record.team) }}
        </p>
        <p v-else-if="isPastRound" class="text-caption break-keep text-content-tertiary">
          지난 라운드의 팀원 구성은 남아 있지 않아요.
        </p>
      </KillshotPhotoHeader>

      <div class="flex flex-col gap-3 rounded-md border border-stroke bg-surface p-4">
        <div class="flex items-center gap-2">
          <BaseBadge :tone="RECORD_STATUS_TONE[record.status]" appearance="outline">
            {{ RECORD_STATUS_LABEL[record.status] }}
          </BaseBadge>
          <span
            v-if="record.judgedAtMs !== null"
            class="ml-auto shrink-0 text-caption text-content-secondary"
          >
            {{ formatRelativeTime(record.judgedAtMs, nowMs) }} 판정
          </span>
        </div>

        <div v-if="record.targetTeam !== null" class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-caption text-content-secondary">잡힌 팀</span>
            <BaseBadge :team="displayGroup(record.targetTeam) ?? undefined">
              {{ teamChipLabel(record.targetTeam) }}
            </BaseBadge>
          </div>
          <p
            v-if="memberNames(record.targetTeam) !== ''"
            class="text-caption break-keep text-content-secondary"
          >
            팀원 {{ memberNames(record.targetTeam) }}
          </p>
        </div>
        <p v-else class="text-caption break-keep text-content-secondary">
          {{ STATUS_DESCRIPTION[record.status] }}
        </p>
      </div>
    </div>
  </BaseBottomSheet>
</template>
