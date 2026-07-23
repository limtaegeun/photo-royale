<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { storeToRefs } from 'pinia'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import PlayerChip from '@/shared/components/PlayerChip.vue'
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
  assignedCount,
} = storeToRefs(store)

/** 현재 선택된 모드 정의 — 행 라벨·캡션에 쓴다 */
const currentMode = computed(() => GAME_MODES[draftGameMode.value])

/** 팀 섹션 헤더 요약에 쓰는 팀 수 */
const teamCount = computed(() => draftTeams.value.length)

/**
 * 칩이 하나라도 선택된 상태인지 — 선택 중일 때만 이동 힌트를 띄우고, 팀/대기자 카드를
 * 드롭 타겟으로 강조한다(보더를 brand 코발트로 바꿔 "여기로 옮길 수 있음"을 시각화).
 */
const hasSelection = computed(() => selectedMemberId.value !== null)
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

/**
 * 팀 카드 보더 상태 — 4조합을 리터럴 클래스로 매핑(Tailwind 스캐너 대응).
 * 선택 중이면 drop 타겟이므로 brand 코발트 보더로 강조하고(칩 선택 ring=라임과 색을 구분),
 * 멤버가 없는 빈 팀은 채워질 자리임을 점선 보더로 표현한다.
 */
function teamCardBorderClass(team: { members: unknown[] }): string {
  const empty = team.members.length === 0
  if (hasSelection.value) return empty ? 'border-brand border-dashed' : 'border-brand'
  return empty ? 'border-dashed border-stroke-strong' : 'border-stroke'
}

/**
 * 드래그 앤 드롭(sortablejs) — 모바일 기준 이동 수단. 각 팀 칩 컨테이너와 미배정 대기자
 * 컨테이너를 같은 group으로 묶어, 칩을 다른 섹션에 놓으면 이동한다. 기존 탭 이동(칩 선택 →
 * 팀 터치)은 폴백·접근성용으로 그대로 둔다.
 */
const boardRef = ref<HTMLElement | null>(null)
/** 현재 살아 있는 Sortable 인스턴스들 — 재초기화 시 destroy 대상 */
const sortables: Sortable[] = []

/**
 * 드롭 완료 처리 — Vue 상태가 단일 진실원이므로, Sortable이 옮겨 놓은 DOM을 먼저 원위치로
 * 되돌린 뒤(되돌리지 않으면 Vue 재렌더가 만든 새 노드와 Sortable이 옮긴 노드가 중복된다)
 * store.moveMember로만 실제 이동을 반영한다 — 이어지는 Vue 재렌더가 최종 UI를 만든다.
 */
function handleDragEnd(evt: Sortable.SortableEvent) {
  const { item, from, to, oldIndex } = evt
  // 되돌리기: 목적지에서 떼어내 원래 컨테이너의 원래 위치(oldIndex)에 다시 꽂는다
  if (item.parentNode) item.parentNode.removeChild(item)
  const reference = oldIndex != null ? (from.children[oldIndex] ?? null) : null
  from.insertBefore(item, reference)

  // 같은 컨테이너 내 재정렬은 팀 소속이 안 바뀌므로 무시한다(칩 순서는 Vue 상태 기준)
  if (to === from) return

  const memberId = item.getAttribute('data-member')
  const dropTarget = to.getAttribute('data-drop-target')
  if (memberId === null || dropTarget === null) return
  // 컨테이너의 data-drop-target: 팀 완장 문자열 또는 'waiting'(대기열=null)
  store.moveMember(memberId, dropTarget === 'waiting' ? null : dropTarget)
}

/** 컨테이너 하나에 Sortable을 붙인다 — 팀 칩 영역/대기자 칩 영역 공통 옵션 */
function createSortable(el: HTMLElement): Sortable {
  return Sortable.create(el, {
    group: 'assignment-members',
    // 래퍼 버튼(data-member)만 드래그 대상 — ×2 배지·"비어 있음" 문구는 끌리지 않는다
    draggable: '[data-member]',
    // 모바일: 150ms 롱프레스로 드래그 시작 → 짧은 탭은 그대로 click(선택 토글)으로 통과한다.
    // delayOnTouchOnly로 마우스에는 지연을 걸지 않고, 세로 스크롤과 드래그를 구분한다.
    delay: 150,
    delayOnTouchOnly: true,
    animation: 150,
    forceFallback: false,
    ghostClass: 'member-ghost',
    chosenClass: 'member-chosen',
    onEnd: handleDragEnd,
  })
}

function destroySortables() {
  while (sortables.length > 0) sortables.pop()!.destroy()
}

/** boardRef 아래의 모든 드롭 컨테이너(data-drop-target)에 Sortable을 새로 붙인다 */
function initSortables() {
  destroySortables()
  const root = boardRef.value
  if (root === null) return
  const containers = root.querySelectorAll<HTMLElement>('[data-drop-target]')
  containers.forEach((el) => sortables.push(createSortable(el)))
}

onMounted(() => {
  void nextTick(initSortables)
})
onBeforeUnmount(destroySortables)

// 팀 구성(완장 목록)·대기자 섹션 유무가 바뀌면 컨테이너 DOM이 갈리므로(팀 추가·재배정·대기자
// 등장/소멸) destroy 후 재초기화한다. 멤버가 팀 사이를 오가는 것만으로는 컨테이너 요소가
// 유지되므로 재초기화가 필요 없다. nextTick으로 새 DOM이 그려진 뒤 붙인다.
watch(
  () => `${draftTeams.value.map((team) => team.armband).join('|')}#${waitingPool.value.length > 0}`,
  () => {
    void nextTick(initSortables)
  },
)

/** 배정 확정 — 성공하면 상위(대기실)에 알린다. 실패는 confirmError로 화면에 남는다 */
async function onConfirm() {
  const ok = await store.confirm(props.roomCode)
  if (ok) emit('confirmed')
}
</script>

<template>
  <!-- H03 호스트 배정 편집 보드 — 대기실(라이트) 안에서 렌더된다. 터치 배정:
       멤버 칩을 선택한 뒤 팀 카드/대기자 영역을 눌러 이동시킨다.
       페이지 타이틀('배정 편집')·설명은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음). -->
  <section ref="boardRef" class="flex flex-1 flex-col gap-6">
    <!-- 설정 카드 — 게임 모드([1] 모드 선택 축)와 특수 완장 X([2] 세부 모듈)를 한 카드로 묶고
         divider로 구분한다. 각 행은 라벨+캡션(좌) / 컨트롤(우), 컨트롤이 48px 터치 타겟을 보장한다. -->
    <div class="rounded-lg border border-stroke bg-elevated">
      <div class="flex min-h-(--pr-size-control-lg) items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <p class="text-label text-content">게임 모드</p>
          <p class="mt-0.5 truncate text-caption text-content-secondary">
            {{ currentMode.label }} · {{ currentMode.description }}
          </p>
        </div>
        <BaseButton variant="ghost" size="md" class="shrink-0" @click="isModeSheetOpen = true">
          변경
        </BaseButton>
      </div>

      <div class="mx-4 h-px bg-stroke" aria-hidden="true" />

      <div class="flex min-h-(--pr-size-control-lg) items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <p class="text-label text-content">특수 완장 X</p>
          <p class="mt-0.5 text-caption text-content-secondary">
            그룹마다 2인 팀 1팀이 X를 겸합니다
          </p>
        </div>
        <BaseSegmented v-model="xModuleValue" :options="X_MODULE_OPTIONS" class="shrink-0" />
      </div>
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

    <!-- 팀 편성 섹션 — 헤더(요약+LIVE) → 선택 힌트 → 팀 그리드. 관련 요소는 gap-3로 묶는다. -->
    <div class="flex flex-col gap-3">
      <!-- 섹션 헤더: 옛 '터치 배정 보드' 안내 카드를 축소 통합 — 요약 텍스트 + LIVE 배지만 남긴다 -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-subheading text-content">팀 편성</h2>
          <p class="mt-0.5 text-caption text-content-secondary">
            {{ teamCount }}팀 · {{ assignedCount }}명 배정
          </p>
        </div>
        <BaseBadge tone="success" appearance="outline" size="sm">LIVE</BaseBadge>
      </div>

      <!-- 이동 힌트 — 칩 선택 중에만(한 곳에서만) 노출. 이 동안 팀/대기자 카드는 brand 보더로 강조된다 -->
      <p
        v-if="hasSelection"
        role="status"
        class="rounded-md border border-brand bg-elevated px-3 py-2 text-caption font-semibold text-content"
      >
        이동할 팀 카드를 터치하세요
      </p>

      <!-- 팀 그리드 -->
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="team in draftTeams"
          :key="team.armband"
          role="button"
          tabindex="0"
          :aria-label="`팀 ${team.armband}로 이동`"
          :data-team="team.armband"
          class="flex flex-col gap-2 rounded-lg border bg-elevated p-3 transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          :class="teamCardBorderClass(team)"
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

          <!-- 칩 영역 — min-h로 빈 팀도 카드 높이가 흔들리지 않게 고정한다.
               data-drop-target(팀 완장)으로 Sortable 드롭 대상이 된다(빈 팀도 드롭 가능). -->
          <div
            :data-drop-target="team.armband"
            class="flex min-h-(--pr-size-control-md) flex-wrap content-center items-center gap-1.5"
          >
            <template v-if="team.members.length > 0">
              <template v-for="member in team.members" :key="member.id">
                <!-- 선택 상태는 래퍼 버튼의 ring(라임)으로, 참가자 표시는 대기실과 동일한 PlayerChip으로 통일한다.
                     팀 카드 내 칩은 team을 넘겨 그룹 보더 색으로 카드 그룹 표기를 보강한다. -->
                <button
                  type="button"
                  :aria-pressed="isSelected(member.id)"
                  :data-member="member.id"
                  :data-selected="isSelected(member.id)"
                  class="inline-flex min-h-(--pr-size-control-md) items-center rounded-full
                         transition-shadow duration-100 ease-standard
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  :class="isSelected(member.id) ? 'ring-2 ring-accent' : ''"
                  @click.stop="store.selectMember(member.id)"
                >
                  <PlayerChip :name="member.name" :team="team.armband" :gender="member.gender" />
                </button>
                <!-- 1인 팀: 목숨·포인트 2배 표기 -->
                <BaseBadge v-if="team.members.length === 1" tone="warning" size="sm">×2</BaseBadge>
              </template>
            </template>
            <!-- 빈 팀: 채워질 자리임을 캡션으로 표기(카드 보더는 점선으로 이미 표현) -->
            <span v-else class="text-caption text-content-tertiary">비어 있음</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 미배정 대기자 — 팀 카드와 동일하게 선택 중이면 drop 타겟으로 강조하고, 칩 영역 높이를 고정한다 -->
    <div
      v-if="waitingPool.length > 0"
      role="button"
      tabindex="0"
      aria-label="미배정 대기자로 이동"
      data-waiting-pool
      class="flex flex-col gap-2 rounded-lg border bg-elevated p-3 transition-colors duration-100 ease-standard
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      :class="hasSelection ? 'border-brand' : 'border-stroke'"
      @click="store.moveSelectedTo(null)"
      @keydown.enter.prevent="store.moveSelectedTo(null)"
      @keydown.space.prevent="store.moveSelectedTo(null)"
    >
      <p class="text-label text-warning">미배정 대기자 {{ waitingPool.length }}명</p>
      <!-- data-drop-target="waiting" — Sortable 드롭 시 대기열(null)로 이동시킨다 -->
      <div
        data-drop-target="waiting"
        class="flex min-h-(--pr-size-control-md) flex-wrap content-center items-center gap-1.5"
      >
        <!-- 대기자는 미배정이므로 team=null(중립 보더). 선택 상태는 래퍼 버튼의 ring으로 표기한다. -->
        <button
          v-for="member in waitingPool"
          :key="member.id"
          type="button"
          :aria-pressed="isSelected(member.id)"
          :data-member="member.id"
          :data-selected="isSelected(member.id)"
          class="inline-flex min-h-(--pr-size-control-md) items-center rounded-full
                 transition-shadow duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          :class="isSelected(member.id) ? 'ring-2 ring-accent' : ''"
          @click.stop="store.selectMember(member.id)"
        >
          <PlayerChip :name="member.name" :team="null" :gender="member.gender" />
        </button>
      </div>
    </div>

    <!-- 액션 — 주 CTA(배정 확정, accent)를 하단 풀폭으로 두어 위계를 세우고, 보조 액션
         (재배정·팀 추가, ghost)은 그 위 한 행으로 묶는다. -->
    <div class="mt-auto flex flex-col gap-3">
      <p v-if="confirmError" class="text-caption text-danger" role="alert">
        {{ confirmError }}
      </p>
      <div class="flex flex-col gap-2">
        <div class="grid grid-cols-2 gap-3">
          <BaseButton variant="ghost" size="md" :loading="isRerolling" @click="store.reroll()">
            랜덤 재배정
          </BaseButton>
          <BaseButton variant="ghost" size="md" @click="store.addTeam()">
            + 팀 추가
          </BaseButton>
        </div>
        <p class="text-caption text-content-tertiary">
          랜덤 재배정은 이번 모임에서 아직 만나지 않았던 사람 위주로 섞습니다.
        </p>
      </div>
      <!-- 재배정 중에도 확정 버튼은 그대로 둔다: 재배정은 로컬 동기 재계산이라 isRerolling은
           실제 완료 후의 인위적 피드백 표시일 뿐, draftTeams는 클릭 시점에 이미 최종 상태다.
           즉 "재배정이 아직 끝나지 않은 어중간한 상태"가 존재하지 않으므로 막을 이유가 없다. -->
      <BaseButton
        variant="accent"
        size="lg"
        class="w-full"
        :disabled="!canConfirm"
        @click="onConfirm"
      >
        배정 확정
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
/* 드래그 중 원위치에 남는 고스트 — 반투명으로 "여기서 출발"을 표시(색은 원 칩 색 유지, 투명도만 조절). */
.member-ghost {
  opacity: 0.4;
}

/* 집어 든 칩 — 살짝 키워 들려 있는 느낌만 준다(색값 도입 없이 transform만). */
.member-chosen {
  transform: scale(1.05);
}
</style>
