<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import { groupForArmband, type TeamGroup } from '../armbands'
import { GAME_MODE_IDS, GAME_MODES, type GameModeId } from '../gameModes'
import { useTeamAssignmentStore } from '../stores/useTeamAssignmentStore'

interface Props {
  /** 방 초대 코드(= 방 문서 ID) — 확정 시 writeBatch 대상 */
  roomCode: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ confirmed: [] }>()

// 드래프트는 페이지가 startDraft로 미리 채워 둔다 — 이 컴포넌트는 편집·확정만 담당한다
const store = useTeamAssignmentStore()
const {
  draftTeams,
  draftGameMode,
  waitingPool,
  selectedMemberId,
  canConfirm,
  confirmError,
  isRerolling,
} = storeToRefs(store)

/** 현재 선택된 모드 정의 — 행 라벨·캡션에 쓴다 */
const currentMode = computed(() => GAME_MODES[draftGameMode.value])
/** 시트에 순서대로 나열할 모드 정의 목록 */
const modeOptions = computed(() => GAME_MODE_IDS.map((id) => GAME_MODES[id]))

const isModeSheetOpen = ref(false)

/** 모드 선택 — 스토어 드래프트를 바꾸고 시트를 닫는다(확정 시에만 서버에 커밋된다) */
function selectGameMode(id: GameModeId) {
  store.setGameMode(id)
  isModeSheetOpen.value = false
}

/** X 모듈 토글 — 세그먼트 값('on'/'off')과 스토어 boolean을 잇는다 */
const X_MODULE_OPTIONS = [
  { label: '끔', value: 'off' },
  { label: '켬', value: 'on' },
]
const xModuleValue = computed<string>({
  get: () => (store.xModuleEnabled ? 'on' : 'off'),
  set: (value) => store.setXModule(value === 'on'),
})

/**
 * 그룹 색 리터럴 맵 — Tailwind 스캐너 대응(문자열 조합 금지). PlayerChip.vue의 TEAM_* 맵과 같은 방식.
 * 텍스트 색만 필요하므로 text-team-* 유틸리티만 매핑한다.
 */
const GROUP_TEXT = {
  blue: 'text-team-blue',
  orange: 'text-team-orange',
  green: 'text-team-green',
  red: 'text-team-red',
} as const

/** 그룹 영문 라벨 — 색약 대응(색+텍스트 병기) */
const GROUP_LABEL_EN = {
  blue: 'BLUE',
  orange: 'ORANGE',
  green: 'GREEN',
  red: 'RED',
} as const

/** 완장 알파벳 → 그룹. 방어적으로 A~Z 한 글자가 아니면 null(중립 처리) */
function groupOf(armband: string): TeamGroup | null {
  return /^[A-Z]$/.test(armband) ? groupForArmband(armband) : null
}
function groupTextClass(armband: string): string {
  const group = groupOf(armband)
  return group === null ? 'text-content-secondary' : GROUP_TEXT[group]
}
function groupEnLabel(armband: string): string {
  const group = groupOf(armband)
  return group === null ? '' : GROUP_LABEL_EN[group]
}

function isSelected(id: string): boolean {
  return selectedMemberId.value === id
}

/** 배정 확정 — 성공하면 상위(대기실)에 알린다. 실패는 confirmError로 화면에 남는다 */
async function onConfirm() {
  const ok = await store.confirm(props.roomCode)
  if (ok) emit('confirmed')
}
</script>

<template>
  <!-- H03 호스트 배정 편집 보드 — 대기실(라이트) 안에서 렌더된다. 터치 배정:
       멤버 칩을 선택한 뒤 팀 카드/대기자 영역을 눌러 이동시킨다. -->
  <section class="flex flex-1 flex-col gap-6">
    <!-- 안내 카드 — 페이지 타이틀('배정 편집')·설명은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음).
         진행 상태 배지(LIVE)는 보드 맥락 정보라 이 카드 헤더에 병기한다. -->
    <div class="rounded-lg border border-stroke bg-elevated p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-label text-content">터치 배정 보드</h2>
        <BaseBadge tone="success" appearance="outline" size="sm">LIVE</BaseBadge>
      </div>
      <p class="mt-1 text-caption text-content-secondary">
        랜덤 재배정은 이번 모임에서 아직 만나지 않았던 사람 위주로 섞습니다.
      </p>
    </div>

    <!-- 게임 모드 — [1] 모드 선택 축. X 모듈([2] 세부 모듈)보다 위에 둔다 -->
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <p class="text-label text-content">게임 모드</p>
        <p class="mt-1 truncate text-caption text-content-secondary">
          {{ currentMode.label }} · {{ currentMode.description }}
        </p>
      </div>
      <BaseButton variant="ghost" size="md" class="shrink-0" @click="isModeSheetOpen = true">
        변경
      </BaseButton>
    </div>

    <!-- 모드 선택 시트 — GAME_MODE_IDS 순서로 나열, 현재 선택을 강조한다 -->
    <BaseBottomSheet v-model:open="isModeSheetOpen" title="게임 모드 선택">
      <ul class="flex flex-col gap-2">
        <li v-for="mode in modeOptions" :key="mode.id">
          <button
            type="button"
            :data-mode="mode.id"
            :aria-pressed="mode.id === draftGameMode"
            :disabled="!mode.available"
            :aria-disabled="!mode.available"
            class="flex min-h-(--pr-size-control-md) w-full flex-col items-start justify-center gap-0.5
                   rounded-md px-4 py-2 text-left transition-colors duration-100 ease-standard
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                   disabled:cursor-default"
            :class="!mode.available
              ? 'border border-stroke'
              : mode.id === draftGameMode ? 'border-2 border-accent bg-surface' : 'border border-stroke-strong'"
            @click="selectGameMode(mode.id)"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="text-label"
                :class="mode.available ? 'text-content' : 'text-content-disabled'"
              >
                {{ mode.label }}
              </span>
              <BaseBadge v-if="!mode.available" tone="neutral" size="sm">준비 중</BaseBadge>
            </span>
            <span
              class="text-caption"
              :class="mode.available ? 'text-content-secondary' : 'text-content-disabled'"
            >
              {{ mode.description }}
            </span>
          </button>
        </li>
      </ul>
    </BaseBottomSheet>

    <!-- X 모듈 -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-label text-content">특수 완장 X</p>
        <p class="mt-1 text-caption text-content-secondary">
          그룹마다 2인 팀 1팀이 X를 겸합니다
        </p>
      </div>
      <BaseSegmented v-model="xModuleValue" :options="X_MODULE_OPTIONS" class="shrink-0" />
    </div>

    <!-- 팀 그리드 -->
    <div class="grid grid-cols-2 gap-3">
      <div
        v-for="team in draftTeams"
        :key="team.armband"
        role="button"
        tabindex="0"
        :aria-label="`팀 ${team.armband}로 이동`"
        :data-team="team.armband"
        class="flex flex-col gap-2 rounded-lg border border-stroke bg-elevated p-3
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        @click="store.moveSelectedTo(team.armband)"
        @keydown.enter.prevent="store.moveSelectedTo(team.armband)"
        @keydown.space.prevent="store.moveSelectedTo(team.armband)"
      >
        <!-- 팀 헤더: 팀명 + (X 겸직 배지) + 그룹 표기 -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-label text-content">팀{{ team.armband }}</span>
            <BaseBadge v-if="team.isXTeam" tone="warning" size="sm">X</BaseBadge>
          </div>
          <span class="text-caption font-semibold" :class="groupTextClass(team.armband)">
            {{ groupEnLabel(team.armband) }} {{ team.armband }}
          </span>
        </div>

        <!-- 멤버 칩 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <template v-for="member in team.members" :key="member.id">
            <button
              type="button"
              :aria-pressed="isSelected(member.id)"
              :data-member="member.id"
              :data-selected="isSelected(member.id)"
              class="inline-flex min-h-(--pr-size-control-md) items-center rounded-full bg-surface px-3
                     text-label text-content transition-colors duration-100 ease-standard
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              :class="isSelected(member.id) ? 'border-2 border-accent' : 'border border-stroke-strong'"
              @click.stop="store.selectMember(member.id)"
            >
              {{ member.name }}
            </button>
            <!-- 1인 팀: 목숨·포인트 2배 표기 -->
            <BaseBadge v-if="team.members.length === 1" tone="warning" size="sm">×2</BaseBadge>
          </template>
        </div>

        <p class="text-caption text-content-tertiary">팀 터치 시 이동</p>
      </div>
    </div>

    <!-- 미배정 대기자 -->
    <div
      v-if="waitingPool.length > 0"
      role="button"
      tabindex="0"
      aria-label="미배정 대기자로 이동"
      data-waiting-pool
      class="flex flex-col gap-2 rounded-lg border border-stroke bg-elevated p-3
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      @click="store.moveSelectedTo(null)"
      @keydown.enter.prevent="store.moveSelectedTo(null)"
      @keydown.space.prevent="store.moveSelectedTo(null)"
    >
      <p class="text-label text-warning">미배정 대기자 {{ waitingPool.length }}명</p>
      <p class="text-caption text-content-secondary">선택 칩을 여기로 보낼 수 있습니다</p>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="member in waitingPool"
          :key="member.id"
          type="button"
          :aria-pressed="isSelected(member.id)"
          :data-member="member.id"
          :data-selected="isSelected(member.id)"
          class="inline-flex min-h-(--pr-size-control-md) items-center rounded-full bg-surface px-3
                 text-label text-content transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          :class="isSelected(member.id) ? 'border-2 border-accent' : 'border border-stroke-strong'"
          @click.stop="store.selectMember(member.id)"
        >
          {{ member.name }}
        </button>
      </div>
    </div>

    <!-- 액션 -->
    <div class="mt-auto flex flex-col gap-3">
      <p v-if="confirmError" class="text-caption text-danger" role="alert">
        {{ confirmError }}
      </p>
      <div class="grid grid-cols-2 gap-3">
        <BaseButton variant="ghost" size="md" :loading="isRerolling" @click="store.reroll()">
          랜덤 재배정
        </BaseButton>
        <!-- 재배정 중에도 확정 버튼은 그대로 둔다: 재배정은 로컬 동기 재계산이라 isRerolling은
             실제 완료 후의 인위적 피드백 표시일 뿐, draftTeams는 클릭 시점에 이미 최종 상태다.
             즉 "재배정이 아직 끝나지 않은 어중간한 상태"가 존재하지 않으므로 막을 이유가 없다. -->
        <BaseButton variant="accent" size="md" :disabled="!canConfirm" @click="onConfirm">
          배정 확정
        </BaseButton>
      </div>
      <BaseButton variant="ghost" size="md" class="w-full" @click="store.addTeam()">
        + 팀 추가
      </BaseButton>
    </div>
  </section>
</template>
