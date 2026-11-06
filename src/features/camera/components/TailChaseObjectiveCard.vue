<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import {
  groupBorderClass,
  groupLabelKo,
  groupOnSolidTextClass,
  groupSolidBgClass,
  groupTextClass,
} from '@/features/team-assignment'
import type { TailChaseObjective } from '../tailChaseObjective'

/**
 * 꼬리잡기 목표 카드(P17) — 일반 목표 문구와 팀·생존 칩 줄을 한 카드로 합친다. 곁눈질로도 "쫓는 팀 → 우리 팀 →
 * 잡을 팀"이 읽히도록 잡을 팀 타일만 크게 그린다. 표시만 맡고 사슬 계산은 tailChaseObjective.ts가 한다.
 */
interface Props {
  objective: TailChaseObjective
  /** 모드 이름 — 머리줄 첫 칸 */
  modeLabel: string
  /** "생존 N / M팀" — 콕핏의 다른 모드 칩과 같은 표기 */
  teamCountLabel: string
  /** 우리 팀 칸의 둘째 줄 — "팀원 민준" 또는 "1인 팀" */
  teammateLabel: string
  remainingTime: string
  /** 일시정지·라운드 종료 — 타이머를 경고색으로 그린다 */
  isTimerWarning: boolean
  /** 라운드가 끝나면 더 잡을 수 없으니 사슬 대신 안내를 보여 준다 */
  isRoundEnded: boolean
}

const props = defineProps<Props>()

/** 잡을 팀이 바뀐 뒤 '새 목표' 배지를 유지하는 시간 — 뛰는 중에 폰을 다시 볼 때까지 남도록 토스트보다 길게 둔다 */
const NEW_TARGET_BADGE_MS = 30_000

const isNewTarget = ref(false)
let newTargetTimer: ReturnType<typeof setTimeout> | null = null

function clearNewTargetTimer() {
  if (newTargetTimer !== null) clearTimeout(newTargetTimer)
  newTargetTimer = null
}

// 소스를 배열로 넘겨 값별로 비교한다 — 원장이 갱신돼도 잡을 팀이 그대로면 배지 시간을 건드리지 않는다
watch(
  [() => props.objective.prey, () => props.objective.role],
  ([prey, role], [previousPrey, previousRole]) => {
    clearNewTargetTimer()
    // 잡혀서 꼬리가 된 순간은 새 목표가 아니다 — 아래 '꼬리' 배지가 그 변화를 알린다
    isNewTarget.value = prey !== null && prey !== previousPrey && role === previousRole
    if (isNewTarget.value) {
      newTargetTimer = setTimeout(() => {
        isNewTarget.value = false
        newTargetTimer = null
      }, NEW_TARGET_BADGE_MS)
    }
  },
)
onUnmounted(clearNewTargetTimer)

const isTail = computed(() => props.objective.role === 'tail')
const badgeLabel = computed(() => {
  if (isTail.value) return '꼬리'
  return isNewTarget.value ? '새 목표' : '목표'
})
const statusLine = computed(() => {
  const parts = [props.modeLabel, props.teamCountLabel]
  if (props.objective.tailCount > 0) parts.push(`꼬리 ${props.objective.tailCount}명`)
  return parts.join(' · ')
})

const isLastStanding = computed(() => props.objective.prey === null)
const isDuel = computed(
  () => !isLastStanding.value && props.objective.chaser === props.objective.prey,
)

interface ChainColumn {
  armband: string
  label: string
  detail: string
  detailClass: string
  tileClass: string
  labelClass: string
}

/** 타일 공통 — 잡을 팀만 한 단계 크다. 동적 클래스는 리터럴 문자열(스캐너 대응) */
const BASE_TILE = 'flex items-center justify-center rounded-md'
const REGULAR_TILE = `${BASE_TILE} size-10 text-heading`
const PREY_TILE = `${BASE_TILE} size-12 text-title`

function solidTileClass(armband: string) {
  return [groupSolidBgClass(armband), groupOnSolidTextClass(armband)].join(' ')
}

const columns = computed<ChainColumn[]>(() => {
  const { team, chaser, prey, preyLivesLeft } = props.objective
  const result: ChainColumn[] = []
  if (chaser !== null && !isDuel.value) {
    result.push({
      armband: chaser,
      label: '쫓는 팀',
      detail: groupLabelKo(chaser),
      detailClass: groupTextClass(chaser),
      tileClass: `${REGULAR_TILE} border-2 ${groupBorderClass(chaser)} ${groupTextClass(chaser)}`,
      labelClass: 'text-content-secondary',
    })
  }
  result.push({
    armband: team,
    label: isTail.value ? '합류한 팀' : '우리 팀',
    detail: isTail.value ? groupLabelKo(team) : props.teammateLabel,
    detailClass: groupTextClass(team),
    tileClass: `${REGULAR_TILE} ${solidTileClass(team)}`,
    labelClass: 'text-content-secondary',
  })
  if (prey !== null) {
    result.push({
      armband: prey,
      label: isTail.value ? `${team}팀 목표` : '잡을 팀',
      detail: preyLivesLeft === null ? groupLabelKo(prey) : `목숨 ${preyLivesLeft}`,
      detailClass: groupTextClass(prey),
      tileClass: `${PREY_TILE} ${solidTileClass(prey)}`,
      labelClass: 'font-semibold',
    })
  }
  return result
})

const tailNotice = computed(() =>
  isLastStanding.value ? '촬영 불가' : `촬영 불가 · ${props.objective.team}팀이 잡으면 점수 공유`,
)
</script>

<template>
  <div class="mt-3 flex flex-col gap-2 rounded-lg bg-scrim-strong p-3">
    <div class="flex items-center gap-2">
      <BaseBadge class="shrink-0" :tone="isTail ? 'danger' : 'accent'">{{ badgeLabel }}</BaseBadge>
      <span class="min-w-0 flex-1 text-caption text-pretty break-keep text-content-secondary">
        {{ statusLine }}
      </span>
      <span
        aria-label="게임 남은 시간"
        class="shrink-0 font-mono text-subheading leading-6"
        :class="isTimerWarning ? 'text-warning' : 'text-info'"
      >
        {{ remainingTime }}
      </span>
    </div>

    <p v-if="isRoundEnded" class="text-label text-pretty break-keep">
      라운드가 종료됐어요. 진행자 안내를 기다려 주세요.
    </p>

    <template v-else>
      <div v-if="isLastStanding" class="flex items-center gap-3">
        <span class="shrink-0" :class="[REGULAR_TILE, solidTileClass(objective.team)]">
          {{ objective.team }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-label">마지막 생존 팀</p>
          <p class="text-caption text-content-secondary">잡을 팀 없음</p>
        </div>
      </div>

      <div
        v-else
        class="grid items-start gap-x-1"
        :class="
          isDuel
            ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]'
        "
      >
        <template v-for="(column, index) in columns" :key="column.armband">
          <div
            v-if="index > 0 && isDuel"
            class="flex w-24 flex-col items-center gap-1 text-center text-caption text-content-secondary"
          >
            <span class="flex h-12 items-center">
              <svg aria-hidden="true" class="size-6 text-content" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 8h17M16 4l4 4-4 4M21 16H4M8 12l-4 4 4 4"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span>맞대결</span>
          </div>
          <span v-else-if="index > 0" class="flex h-12 items-center">
            <svg
              aria-hidden="true"
              class="size-4"
              :class="index === 1 ? 'text-content-tertiary' : 'text-content'"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M2 8h11M9 4l4 4-4 4"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div class="flex min-w-0 flex-col items-center gap-1 text-center text-caption">
            <span class="flex h-12 items-center">
              <span :class="column.tileClass">{{ column.armband }}</span>
            </span>
            <p class="max-w-full break-keep wrap-anywhere">
              <span class="block" :class="column.labelClass">{{ column.label }}</span>
              <span class="block" :class="column.detailClass">{{ column.detail }}</span>
            </p>
          </div>
        </template>
      </div>

      <p
        v-if="isTail"
        role="status"
        class="text-center text-caption text-pretty break-keep text-danger"
      >
        {{ tailNotice }}
      </p>
    </template>
  </div>
</template>
