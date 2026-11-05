<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSwitch from '@/shared/components/BaseSwitch.vue'
import type { TargetRule } from '@/features/game-mode'
import {
  groupLabelKo,
  groupOnSolidTextClass,
  groupSolidBgClass,
  groupTextClass,
} from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import type { KillMultiplier, Submission, SubmissionTarget } from '../api/submissions'
import type { JudgeIntent } from '../composables/useKillshotJudging'
import { formatRelativeTime } from '../relativeTime'
import { participantName, teamChipLabel } from '../submissionDisplay'
import type { TeamSectionTeam } from '../teamSections'

/**
 * 킬샷 판정 카드 — 시트 없이 카드에서 바로 판정한다. 사진을 보고 완장의 팀을 고른 뒤 확정하거나,
 * 사유 없이 반려한다(확정 스펙: 반려 사유 선택 없음). 실제 쓰기는 호출부 책임이고 여기서는 표시와
 * 고르기만 다룬다.
 */
interface Props {
  submission: Submission
  /** 제출자 이름 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 팀 — 알파벳 순서로 받아 타일로 깐다 */
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
   * 바꾸지 않으므로 선택을 막는다. 원장이 없는 라운드면 빈 배열.
   */
  outTeams: string[]
  /**
   * 특수 완장 X를 겸한 팀 완장(편성 스냅샷) — 일반전의 "X끼리만 사냥" 대상 제한 근거. X를 끈 라운드나
   * 원장이 없는 라운드면 빈 배열.
   */
  xTeams: string[]
  /**
   * 모드의 대상 제한(P07 M4) — 제출 팀이 잡을 수 없는 팀(그룹전의 같은 그룹 동맹, 꼬리잡기의 다음
   * 알파벳이 아닌 팀, 일반전의 X 여부가 다른 팀)을 막고 이유를 보인다. 제한이 없는 모드면 null.
   */
  targetRule: TargetRule | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:selectedTeam': [team: string | null]
  'update:tripleKill': [tripleKill: boolean]
  /** 판정 확정 — 사진 속 완장의 팀과 킬 배율(낙오 포착이면 3) */
  approve: [target: SubmissionTarget, multiplier: KillMultiplier]
  /** 반려 — 사유 없음 */
  reject: []
}>()

/** 팀을 고를 수 없는 이유 — 제출 팀 > 탈락 > 모드 대상 제한 순으로 먼저 걸리는 하나만 보인다 */
function blockReasonOf(armband: string): string | null {
  if (armband === props.submission.team) return '제출 팀'
  if (props.outTeams.includes(armband)) return '탈락'
  const rule = props.targetRule
  if (rule === null) return null
  const context = {
    teams: props.teams.map((team) => team.armband),
    outTeams: props.outTeams,
    xTeams: props.xTeams,
  }
  return rule.canTarget(props.submission.team, armband, context) ? null : rule.blockedBadge
}

const tiles = computed(() =>
  props.teams.map((team) => {
    const blockReason = blockReasonOf(team.armband)
    const label = `팀 ${team.armband} ${groupLabelKo(team.armband)}`
    return {
      ...team,
      blockReason,
      ariaLabel: `${label}, ${blockReason ?? team.members.join(', ')}`,
    }
  }),
)

/**
 * 고른 팀은 지금도 고를 수 있을 때만 유효하다. 골라 둔 뒤 다른 카드의 판정으로 그 팀이 탈락하면(꼬리잡기는
 * 대상도 바뀐다) 카드에 남은 선택으로 확정되지 않게 선택 없음으로 돌아간다.
 */
const pickedTile = computed(
  () =>
    tiles.value.find((tile) => tile.armband === props.selectedTeam && tile.blockReason === null) ??
    null,
)

const isTripleApplied = computed(() => props.allowTripleKill && props.tripleKill)

const approveLabel = computed(() => {
  if (pickedTile.value === null) return '판정 확정'
  return isTripleApplied.value
    ? `팀 ${pickedTile.value.armband} 3배 판정 확정`
    : `팀 ${pickedTile.value.armband} 판정 확정`
})

/** 같은 타일을 다시 누르면 선택을 푼다 — 잘못 고른 뒤 반려하려는 사람이 되돌릴 수 있게 */
function toggleTeam(armband: string) {
  emit('update:selectedTeam', pickedTile.value?.armband === armband ? null : armband)
}

function handleApprove() {
  const picked = pickedTile.value
  if (picked === null) return
  emit(
    'approve',
    { team: picked.armband, participantUid: picked.participantUid },
    isTripleApplied.value ? 3 : 1,
  )
}
</script>

<template>
  <!-- 액션 바가 sticky라 카드에 overflow-hidden을 주면 안 된다 -->
  <BaseCard
    as="article"
    padding="none"
    class="flex flex-col"
    :aria-label="`${participantName(participants, submission.uid)}의 킬샷 판정`"
  >
    <header class="flex items-center gap-3 p-4">
      <span
        aria-hidden="true"
        class="flex size-12 shrink-0 items-center justify-center rounded-md text-heading"
        :class="[groupSolidBgClass(submission.team), groupOnSolidTextClass(submission.team)]"
      >
        {{ submission.team }}
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <!-- 닉네임은 최대 12자다 — 시각을 둘째 줄로 내려 이름이 줄 전체를 쓰게 한다 -->
        <span class="truncate text-subheading leading-(--pr-line-height-tight) text-content">
          {{ participantName(participants, submission.uid) }}
        </span>
        <span class="flex items-baseline gap-2">
          <span
            class="shrink-0 text-label leading-(--pr-line-height-tight)"
            :class="groupTextClass(submission.team)"
          >
            {{ teamChipLabel(submission.team) }}
          </span>
          <span class="min-w-0 truncate text-caption leading-(--pr-line-height-tight) text-content-secondary">
            {{ formatRelativeTime(submission.createdAtMs, nowMs) }} 제출
          </span>
        </span>
      </div>
    </header>

    <img :src="submission.photo" alt="판정할 킬샷" class="block h-72 w-full bg-surface object-contain" />

    <!-- 스티키 범위를 타일 영역으로 좁힌다 — 카드 전체로 잡으면 다음 카드가 올라올 때 버튼이 프로필과 사진을 덮는다 -->
    <div>
      <section class="flex flex-col gap-3 p-4">
        <!-- 높이를 고정해 팀을 고르거나 바꿔도 카드가 흔들리지 않게 한다 -->
        <div class="flex min-h-10 items-center gap-2">
          <h3 v-if="pickedTile === null" class="min-w-0 flex-1 text-label text-content">잡힌 팀 선택</h3>
          <template v-else>
            <span class="shrink-0 text-label" :class="groupTextClass(pickedTile.armband)">
              팀 {{ pickedTile.armband }}
            </span>
            <!-- 타일에서 줄어든 긴 닉네임을 전부 보여 주는 자리 — 12자 두 명도 두 줄이면 들어간다 -->
            <span class="flex min-w-0 flex-1 flex-col">
              <span
                v-for="member in pickedTile.members"
                :key="member"
                data-picked-member
                class="truncate text-caption leading-5 text-content-secondary"
              >
                {{ member }}
              </span>
            </span>
          </template>
          <!-- 라벨과 스위치를 붙여 둔다 — 360 폭에서도 12자 이름이 왼쪽에 잘리지 않고 들어갈 자리가 남는다 -->
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

        <!-- 4열이면 알파벳 순서가 그룹 색 순서(파랑·주황·초록·빨강)와 같은 열로 맞는다 -->
        <ul class="grid grid-cols-4 gap-2">
          <li v-for="tile in tiles" :key="tile.armband" class="min-w-0">
            <button
              type="button"
              :data-team="tile.armband"
              :aria-pressed="pickedTile?.armband === tile.armband"
              :aria-label="tile.ariaLabel"
              :disabled="tile.blockReason !== null || locked"
              class="flex h-18 w-full flex-col items-center justify-center gap-1 rounded-md border px-1
                     transition-colors duration-100 ease-standard touch-manipulation disabled:cursor-default
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              :class="[
                tile.blockReason !== null
                  ? 'border-stroke text-content-disabled'
                  : pickedTile?.armband === tile.armband
                    ? [
                        'border-transparent ring-2 ring-accent',
                        groupSolidBgClass(tile.armband),
                        groupOnSolidTextClass(tile.armband),
                      ]
                    : ['border-stroke-strong bg-surface', groupTextClass(tile.armband)],
                locked && tile.blockReason === null && pickedTile?.armband !== tile.armband
                  ? 'opacity-50'
                  : '',
              ]"
              @click="toggleTeam(tile.armband)"
            >
              <span class="text-subheading leading-6 font-bold">{{ tile.armband }}</span>
              <!-- 타일 안에서는 한글 5자까지 보인다 — 긴 이름은 줄이고, 고르면 위 줄에 전부 보인다 -->
              <span
                class="flex w-full min-w-0 flex-col items-center text-caption leading-4"
                :class="
                  tile.blockReason !== null
                    ? 'text-content-tertiary'
                    : pickedTile?.armband === tile.armband
                      ? groupOnSolidTextClass(tile.armband)
                      : 'text-content-secondary'
                "
              >
                <template v-if="tile.blockReason !== null">{{ tile.blockReason }}</template>
                <span
                  v-for="member in tile.members"
                  v-else
                  :key="member"
                  data-tile-member
                  class="max-w-full truncate"
                >
                  {{ member }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <footer
        class="sticky bottom-(--judge-action-bottom) flex gap-3 rounded-b-lg border-t border-stroke bg-elevated px-4 py-3"
      >
        <BaseButton
          variant="ghost"
          size="lg"
          padding="compact"
          class="w-24 text-danger"
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
          :disabled="pickedTile === null || (locked && judgingIntent !== 'approve')"
          :loading="judgingIntent === 'approve'"
          @click="handleApprove"
        >
          {{ approveLabel }}
        </BaseButton>
      </footer>
    </div>
  </BaseCard>
</template>
