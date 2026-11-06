<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { livesOf } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import { OUT_TEAM_REASON, exclusionLine } from '../judgeExclusion'
import { alphabeticalTeams, type DialTeam } from '../teamSections'
import TeamDial from './TeamDial.vue'

/**
 * 스태프 아웃 처리 시트(P07 §4.5) — 스태프에게 잡힌 팀을 진행자가 드럼 다이얼로 골라 원장에 기록한다.
 * 판정 화면과 같은 다이얼을 쓰되 사진이 없어 다이얼이 넓고, 제출자·모드 대상 제한 개념이 없어(스태프는
 * 참가자가 아니다) 이미 탈락한 팀만 뺀다.
 */
interface Props {
  /** 대상 팀 목록 조인용 명단 */
  participants: Participant[]
  /** 이번 라운드 차수 — 이번 라운드 배정자만 나열한다 */
  assignmentRound: number
  /** 이미 탈락한 팀 완장(P07 M3) — 또 아웃 처리할 수 없어 다이얼에서 뺀다 */
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

/** 줄이 많이 보여서 원통을 덜 기울인다 — 위아래 끝 줄도 읽혀야 찾을 수 있다 */
const STAFF_DIAL_TILT = 5

const selected = ref<string | null>(null)
const isDialMoving = ref(false)

// 시트가 닫히면 선택을 비운다 — 다음에 열었을 때 이전 선택이 새 판단에 묻어가지 않게
watch(open, (isOpen) => {
  if (!isOpen) {
    selected.value = null
    isDialMoving.value = false
  }
})

const allTeams = computed(() => alphabeticalTeams(props.participants, props.assignmentRound))

/** 1인 팀은 목숨이 둘이라 남은 목숨을 줄에 적는다 — 한 번 잡혀도 아웃이 아니라는 걸 고르기 전에 알린다 */
const dialTeams = computed<DialTeam[]>(() =>
  allTeams.value
    .filter((team) => !props.outTeams.includes(team.armband))
    .map((team) => ({
      ...team,
      mark:
        (props.teams[team.armband]?.length ?? 0) === 1
          ? `1인 · 목숨 ${livesOf(props.teams, team.armband) - (props.hits[team.armband] ?? 0)}`
          : null,
    })),
)

const dialHint = computed(() =>
  dialTeams.value.length === 0 ? '고를 수 있는 팀이 없어요' : '돌려서 팀 고르기',
)

const summary = computed(
  () => `생존 ${dialTeams.value.length} / ${allTeams.value.length}팀 · 잡힌 팀을 골라 주세요`,
)

const exclusionText = computed(() =>
  exclusionLine(
    allTeams.value
      .filter((team) => props.outTeams.includes(team.armband))
      .map((team) => ({ armband: team.armband, reason: OUT_TEAM_REASON })),
  ),
)

/** 고른 팀이 그 사이 다른 기기의 처리로 탈락하면 선택 없음으로 돌아간다 */
const pickedTeam = computed(
  () => dialTeams.value.find((team) => team.armband === selected.value)?.armband ?? null,
)
const readyTeam = computed(() => (isDialMoving.value ? null : pickedTeam.value))
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="스태프 아웃 처리" :dismissible="!marking">
    <div class="flex flex-col gap-2">
      <p class="text-caption break-keep text-content-secondary">{{ summary }}</p>
      <!-- 시트 최대 높이(85dvh)에서 제목·안내·제외 줄·버튼 자리를 뺀 만큼 쓴다 -->
      <TeamDial
        v-model="selected"
        v-model:moving="isDialMoving"
        class="h-[calc(85dvh-16rem-var(--pr-inset-bottom-safe))] min-h-44"
        :teams="dialTeams"
        :hint="dialHint"
        density="compact"
        :tilt="STAFF_DIAL_TILT"
        :locked="marking"
      />
      <p
        data-testid="staff-exclusion"
        class="flex min-h-10 items-center text-caption break-keep text-content-tertiary"
      >
        {{ exclusionText }}
      </p>
      <BaseButton
        variant="danger"
        size="lg"
        class="w-full"
        :disabled="readyTeam === null || marking"
        :loading="marking"
        @click="emit('confirm', readyTeam!)"
      >
        {{ readyTeam === null ? '아웃 확정' : `팀 ${readyTeam} 아웃 확정` }}
      </BaseButton>
    </div>
  </BaseBottomSheet>
</template>
