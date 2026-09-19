<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { GROUP_LABELS, TEAM_GROUP_ORDER, livesOf, type TeamGroup } from '@/features/game-mode'
import { displayGroup, groupSolidBgClass, groupTextClass } from '@/features/team-assignment'
import { isAssignedInRound, type Participant } from '@/features/waiting-room'

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

interface TeamOption {
  armband: string
  /** 팀원 이름 나열 — 완장만으로는 현장에서 누구인지 떠올리기 어렵다 */
  memberNames: string
  /** 이미 탈락한 팀 — 또 아웃 처리할 수 없어 비활성화한다 */
  isOut: boolean
  /** 1인 팀 — 목숨이 2라 진행자가 두 번 처리해야 함을 알려준다 */
  isSolo: boolean
  /** 남은 목숨 */
  livesLeft: number
}

interface GroupSection {
  group: TeamGroup
  label: string
  textClass: string
  teams: TeamOption[]
}

/** 이번 라운드 배정 팀을 그룹 색 순서(파랑→주황→초록→빨강)로 섹션화한다 — JudgeSheet과 같은 패턴 */
const groupSections = computed<GroupSection[]>(() => {
  const namesByTeam = new Map<string, string[]>()
  for (const participant of props.participants) {
    if (!isAssignedInRound(participant, props.assignmentRound) || participant.team === null) {
      continue
    }
    const names = namesByTeam.get(participant.team) ?? []
    names.push(participant.name)
    namesByTeam.set(participant.team, names)
  }

  return TEAM_GROUP_ORDER.map((group) => {
    const teams = [...namesByTeam.entries()]
      .filter(([armband]) => displayGroup(armband) === group)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([armband, names]) => ({
        armband,
        memberNames: names.join(' · '),
        isOut: props.outTeams.includes(armband),
        isSolo: (props.teams[armband]?.length ?? 0) === 1,
        livesLeft: livesOf(props.teams, armband) - (props.hits[armband] ?? 0),
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

/**
 * 옵션 행 상태별 클래스 — 보더 "폭"은 어느 상태에서도 1px로 고정하고 색만 바꾼다
 * (JudgeSheet과 같은 이유: 선택을 옮길 때 행 높이가 흔들리지 않게).
 */
const OPTION_CLASS = {
  disabled: 'border border-stroke',
  selected: 'border border-accent bg-surface',
  selectable: 'border border-stroke-strong',
} as const

function optionClass(option: TeamOption): string {
  if (option.isOut) return OPTION_CLASS.disabled
  return selected.value === option.armband ? OPTION_CLASS.selected : OPTION_CLASS.selectable
}

function chooseTeam(option: TeamOption) {
  if (option.isOut || props.marking) return
  selected.value = option.armband
}
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
                :aria-pressed="selected === option.armband"
                :disabled="option.isOut || marking"
                :aria-disabled="option.isOut || marking"
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
                  :class="option.isOut ? 'text-content-disabled' : 'text-content'"
                >
                  팀 {{ option.armband }}
                </span>
                <span
                  class="min-w-0 flex-1 truncate text-caption"
                  :class="option.isOut ? 'text-content-disabled' : 'text-content-secondary'"
                >
                  {{ option.memberNames }}
                </span>
                <span
                  v-if="option.isSolo"
                  class="shrink-0 text-caption text-content-secondary"
                >
                  1인 팀 · 목숨 {{ option.livesLeft }}
                </span>
                <BaseBadge v-if="option.isOut" tone="danger" appearance="outline" class="shrink-0">
                  탈락
                </BaseBadge>
              </button>
            </li>
          </ul>
        </section>
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
