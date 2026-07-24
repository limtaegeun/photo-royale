<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import { GameModeRulebook, type GameModeId } from '@/features/game-mode'
import { groupForArmband, type TeamGroup } from '../armbands'

interface Props {
  /** 내 완장 알파벳 — 그룹 색은 완장에서 파생 */
  armband: string
  /** 같은 팀 멤버(본인 포함) */
  members: Array<{ id: string; name: string }>
  /** 본인 참가자 id — 멤버 목록에서 '나' 강조에 쓴다 */
  myId: string
  /** 특수 완장 X 겸직 여부 */
  isXTeam: boolean
  /** 이번 라운드 확정 게임 모드 — 규칙서 배지·목록이 이 모드 정의로 렌더된다 */
  gameMode: GameModeId
}

const props = defineProps<Props>()

/** 그룹 색 리터럴 맵 — Tailwind 스캐너 대응(문자열 조합 금지) */
const GROUP_TEXT = {
  blue: 'text-team-blue',
  orange: 'text-team-orange',
  green: 'text-team-green',
  red: 'text-team-red',
} as const
const GROUP_BAR = {
  blue: 'bg-team-blue-solid',
  orange: 'bg-team-orange-solid',
  green: 'bg-team-green-solid',
  red: 'bg-team-red-solid',
} as const
const GROUP_BORDER = {
  blue: 'border-team-blue',
  orange: 'border-team-orange',
  green: 'border-team-green',
  red: 'border-team-red',
} as const
const GROUP_LABEL_KO = {
  blue: '파랑',
  orange: '주황',
  green: '초록',
  red: '빨강',
} as const
const GROUP_LABEL_EN = {
  blue: 'BLUE',
  orange: 'ORANGE',
  green: 'GREEN',
  red: 'RED',
} as const

/** 완장 알파벳 → 그룹. A~Z 한 글자가 아니면(방어) null → 중립 처리 */
const group = computed<TeamGroup | null>(() =>
  /^[A-Z]$/.test(props.armband) ? groupForArmband(props.armband) : null,
)
const isSolo = computed(() => props.members.length === 1)

const groupTextClass = computed(() =>
  group.value === null ? 'text-content-secondary' : GROUP_TEXT[group.value],
)
const groupBarClass = computed(() =>
  group.value === null ? 'bg-neutral' : GROUP_BAR[group.value],
)
const groupBorderClass = computed(() =>
  group.value === null ? 'border-stroke-strong' : GROUP_BORDER[group.value],
)
const groupLabelKo = computed(() => (group.value === null ? '' : GROUP_LABEL_KO[group.value]))
const groupLabelEn = computed(() => (group.value === null ? '' : GROUP_LABEL_EN[group.value]))

/** 팀 구성 요약 — 2인 1조 / 1인 팀 */
const compositionLabel = computed(() => (isSolo.value ? '1인 팀' : '2인 1조'))
</script>

<template>
  <!-- P03 참가자 배정 카드 — 대기실(라이트) 안에서 렌더된다. 하단 준비 CTA는 페이지가 담당한다.
       페이지 타이틀('라운드 N 배정')은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음). -->
  <section class="flex flex-col gap-6">
    <!-- 완장 히어로 카드 -->
    <div class="flex gap-4 rounded-lg border border-stroke bg-elevated p-5">
      <!-- 완장 타일: 상단 그룹 색 바 + 중앙 알파벳(그룹 색) -->
      <div
        class="flex size-20 shrink-0 flex-col overflow-hidden rounded-md border border-stroke bg-surface"
        aria-hidden="true"
      >
        <span class="h-2 w-full shrink-0" :class="groupBarClass"></span>
        <span
          class="flex flex-1 items-center justify-center text-display"
          :class="groupTextClass"
        >
          {{ armband }}
        </span>
      </div>

      <!-- 완장 설명 -->
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-heading text-content">{{ groupLabelKo }} 완장 {{ armband }}</p>
        <p class="text-caption text-content-secondary">
          그룹 {{ groupLabelEn }} · {{ compositionLabel }}
        </p>
        <p v-if="isSolo" class="text-caption font-semibold text-warning">
          1인 팀 · 목숨과 포인트 2배
        </p>
        <div v-if="isXTeam" class="mt-1 flex flex-col gap-1">
          <BaseBadge tone="warning" size="sm" class="self-start">특수 완장 X</BaseBadge>
          <p class="text-caption text-content-secondary">X끼리만 서로 사냥할 수 있어요</p>
        </div>

        <!-- 멤버 목록 -->
        <ul class="mt-2 flex flex-col gap-2">
          <li
            v-for="member in members"
            :key="member.id"
            class="flex items-center gap-2"
            :data-me="member.id === myId"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-caption font-bold text-content"
              :class="groupBorderClass"
              aria-hidden="true"
            >
              {{ member.name.charAt(0) }}
            </span>
            <span
              class="truncate text-body"
              :class="member.id === myId ? 'font-bold text-content' : 'text-content-secondary'"
            >
              {{ member.id === myId ? `${member.name}(나)` : member.name }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 규칙서 — 모드별 규칙은 game-mode 기능이 소유하고, 카드는 배정 컨텍스트만 넘긴다 -->
    <GameModeRulebook
      :game-mode="gameMode"
      :is-solo="isSolo"
      :group-label-ko="groupLabelKo"
      :group-text-class="groupTextClass"
      :is-x-team="isXTeam"
    />
  </section>
</template>
