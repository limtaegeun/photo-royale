<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { storeToRefs } from 'pinia'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseListRow from '@/shared/components/BaseListRow.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import BaseSwitch from '@/shared/components/BaseSwitch.vue'
import { GameModePicker, GAME_MODES, type GameModeId } from '@/features/game-mode'
import { useTeamAssignmentStore } from '../stores/useTeamAssignmentStore'
import SelectableMemberChip from './SelectableMemberChip.vue'
import TeamCard from './TeamCard.vue'

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

/** 현재 선택된 모드 정의 — 설정 행 캡션에 쓴다 */
const currentMode = computed(() => GAME_MODES[draftGameMode.value])

/** 팀 편성 섹션 헤더의 요약 — 팀 수와 배정 인원 */
const teamSummary = computed(() => `${draftTeams.value.length}팀 · ${assignedCount.value}명 배정`)

/**
 * 칩이 하나라도 선택된 상태인지 — 선택 중일 때만 이동 힌트를 바꾸고, 팀/대기자 카드를
 * 드롭 타겟으로 강조한다(보더를 brand 코발트로 바꿔 "여기로 옮길 수 있음"을 시각화).
 */
const hasSelection = computed(() => selectedMemberId.value !== null)

const isModeSheetOpen = ref(false)

/** 모드 선택 — 스토어 드래프트를 바꾼다(확정 시에만 서버에 커밋된다). 시트는 스스로 닫힌다 */
function selectGameMode(id: GameModeId) {
  store.setGameMode(id)
}

/** X 모듈 토글 — 스위치 boolean을 스토어와 직결한다(확정 시에만 서버에 커밋) */
const isXModuleEnabled = computed<boolean>({
  get: () => store.xModuleEnabled,
  set: (value) => store.setXModule(value),
})

/**
 * 미배정 대기자 영역도 팀 카드와 같은 규칙으로 이동 타겟이 될 때만 버튼으로 노출한다
 * (평상시엔 내부 칩 버튼과의 중첩 인터랙티브·무의미한 탭 정지를 만들지 않는다).
 */
const waitingPoolTargetAttrs = computed(() =>
  hasSelection.value
    ? { role: 'button', tabindex: 0, 'aria-label': '미배정 대기자로 이동' }
    : {},
)

/**
 * 대기자 카드 보더 — 팀 카드(teamCardBorderClass)와 같은 규칙이다. 선택 중이면 drop 타겟이라
 * brand 코발트로 강조하고, 대기자가 없으면 채워질 자리임을 점선으로 표현한다.
 */
const waitingPoolBorderClass = computed(() => {
  const empty = waitingPool.value.length === 0
  if (hasSelection.value) return empty ? 'border-brand border-dashed' : 'border-brand'
  return empty ? 'border-dashed border-stroke-strong' : 'border-stroke'
})

/**
 * 드래그 앤 드롭(sortablejs) — 모바일 기준 이동 수단. 각 팀 칩 컨테이너와 미배정 대기자
 * 컨테이너를 같은 group으로 묶어, 칩을 다른 섹션에 놓으면 이동한다. 기존 탭 이동(칩 선택 →
 * 팀 터치)은 폴백·접근성용으로 그대로 둔다.
 */
const boardRef = ref<HTMLElement | null>(null)
/** 현재 살아 있는 Sortable 인스턴스들 — 재초기화 시 destroy 대상 */
const sortables: Sortable[] = []

/**
 * 드롭 완료 처리 — Vue 상태가 단일 진실원이다. 처리는 두 갈래로 나뉜다.
 *
 * 1) cross-container 정상 드롭(다른 팀/대기열로 이동): DOM을 수동으로 되돌리지 않고 store.moveMember만
 *    호출한다. 멤버 구성이 바뀌면 양쪽 드롭 컨테이너의 membership key(:key)가 달라져 컨테이너가 통째로
 *    재마운트되므로, Sortable이 옮겨 놓은(Vue 추적 밖) 노드는 새 컨테이너로 대체되어 유령으로 남지 않는다.
 *    여기서 굳이 revert하면 재마운트 직전 한 프레임 동안 원위치로 깜빡이므로 revert하지 않는다.
 * 2) 그 외(같은 컨테이너 내 재정렬 to===from, 또는 memberId/dropTarget이 없는 비정상 케이스): 상태 변화가
 *    없으므로 Sortable이 옮긴 노드를 원래 컨테이너의 원래 위치(oldIndex)로 되돌리기만 한다. 컨테이너가
 *    순수 칩 리스트(자식이 [data-member]뿐)라 oldIndex가 그대로 정합한다.
 */
function handleDragEnd(evt: Sortable.SortableEvent) {
  // 탭 선택 해제는 드래그 시작이 아니라 종료 시점에 한다. onStart에서 해제하면 이동 힌트 배너(v-if)가
  // 사라지며 그 아래 팀 카드들이 위로 시프트되는데, 이 시프트가 드래그가 "진행 중인 동안" 일어나
  // 사용자가 조준한 드롭 좌표가 어긋나 이동이 무시되는 버그가 실측(실드래그 2회 재현)됐다.
  store.selectMember(null)

  const { item, from, to, oldIndex } = evt
  const memberId = item.getAttribute('data-member')
  const dropTarget = to.getAttribute('data-drop-target')

  // 컨테이너의 data-drop-target: 팀 완장 문자열 또는 'waiting'(대기열=null)
  if (to !== from && memberId !== null && dropTarget !== null) {
    store.moveMember(memberId, dropTarget === 'waiting' ? null : dropTarget)
    return
  }

  // 되돌리기: 목적지에서 떼어내 원래 컨테이너의 원래 위치(oldIndex)에 다시 꽂는다
  if (item.parentNode) item.parentNode.removeChild(item)
  const reference = oldIndex != null ? (from.children[oldIndex] ?? null) : null
  from.insertBefore(item, reference)
}

/** 컨테이너 하나에 Sortable을 붙인다 — 팀 칩 영역/대기자 칩 영역 공통 옵션 */
function createSortable(el: HTMLElement): Sortable {
  return Sortable.create(el, {
    group: 'assignment-members',
    // 래퍼 버튼(data-member)만 드래그 대상 — 팀 상태 배지·"비어 있음" 문구는 끌리지 않는다
    draggable: '[data-member]',
    // 모바일: 150ms 롱프레스로 드래그 시작 → 짧은 탭은 그대로 click(선택 토글)으로 통과한다.
    // delayOnTouchOnly로 마우스에는 지연을 걸지 않고, 세로 스크롤과 드래그를 구분한다.
    delay: 150,
    delayOnTouchOnly: true,
    animation: 150,
    forceFallback: false,
    ghostClass: 'member-ghost',
    chosenClass: 'member-chosen',
    // 탭 선택 해제는 여기(onStart)가 아니라 handleDragEnd(onEnd) 맨 앞에서 한다 — 이유는
    // handleDragEnd 주석 참조(드래그 도중 해제하면 레이아웃 시프트로 드롭 좌표가 어긋난다).
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

// 멤버 구성이 조금이라도 바뀌면(팀 추가/삭제·재배정·멤버 이동·대기자 등장/소멸) 드롭 컨테이너의
// membership key가 달라져 컨테이너가 통째로 재마운트되므로, 새 컨테이너에 Sortable을 다시 붙여야 한다.
// 따라서 감시 소스를 팀별 "완장+멤버 id" + "대기자 id"의 전체 해시로 잡는다 — 이는 TeamCard의
// 드롭 컨테이너 :key(`완장:멤버id들`)와 대기자 컨테이너 :key(`waiting:id들`)를 합성한 문자열과 동일하다.
// nextTick으로 재마운트된 DOM이 그려진 뒤 destroy→재부착한다.
watch(
  () => {
    const teamsHash = draftTeams.value
      .map((team) => `${team.armband}:${team.members.map((member) => member.id).join('.')}`)
      .join('|')
    return `${teamsHash}#waiting:${waitingPool.value.map((member) => member.id).join('.')}`
  },
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
  <!-- H03 호스트 배정 편집 보드 — 대기실 안에서 렌더된다. 터치 배정: 멤버 칩을 선택한 뒤
       팀 카드/대기자 영역을 눌러 이동시키거나, 칩을 길게 눌러 끌어 옮긴다.
       페이지 타이틀('배정 편집')·설명은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음). -->
  <section ref="boardRef" class="flex flex-1 flex-col gap-6">
    <!-- 설정 카드 — 게임 모드([1] 모드 선택 축)와 특수 완장 X([2] 세부 모듈)를 한 카드에 행으로
         쌓는다. 행 구조·높이는 BaseListRow가, 구분선은 divide-y가 담당한다. -->
    <BaseCard padding="none" class="divide-y divide-stroke">
      <BaseListRow
        label="게임 모드"
        :caption="`${currentMode.label} · ${currentMode.description}`"
      >
        <template #control>
          <!-- 행 안의 인라인 액션은 sm(36px) — 시각 높이를 낮춰 행이 두툼해지지 않게 하고,
               터치 타겟 48px은 BaseButton이 히트 영역 확장으로 보장한다 -->
          <BaseButton variant="ghost" size="sm" @click="isModeSheetOpen = true">변경</BaseButton>
        </template>
      </BaseListRow>

      <BaseListRow label="특수 완장 X" caption="그룹마다 한 팀이 X를 겸합니다">
        <template #control>
          <BaseSwitch v-model="isXModuleEnabled" label="특수 완장 X 모듈" />
        </template>
      </BaseListRow>
    </BaseCard>

    <!-- 모드 선택 시트는 game-mode 기능이 소유한다 — 여기서는 열림 상태와 선택 결과만 다룬다 -->
    <GameModePicker
      v-model:open="isModeSheetOpen"
      :selected="draftGameMode"
      @select="selectGameMode"
    />

    <!-- 팀 편성 섹션 — 헤더(요약+실시간 배지) → 이동 힌트 → 팀 그리드. 관련 요소는 gap-3로 묶는다. -->
    <div class="flex flex-col gap-3">
      <BaseSectionHeader title="팀 편성" :summary="teamSummary">
        <template #aside>
          <!-- 참가자 입장·레디가 스냅샷으로 계속 반영된다는 표시 — 영문 'LIVE'보다 뜻이 분명한 한글 라벨 -->
          <BaseBadge tone="success" appearance="outline" size="sm">실시간</BaseBadge>
        </template>
      </BaseSectionHeader>

      <!-- 이동 힌트 — v-if로 토글하지 않고 항상 렌더한다(텍스트·보더만 전환). 평상시/선택 중 두 상태
           모두 padding·border가 동일해 같은 높이를 차지하므로, 등장·소멸에 의한 레이아웃 시프트가
           생기지 않는다(실측 버그: 배너가 사라지며 팀 카드가 밀려 드래그 중 드롭 좌표가 어긋났다).
           선택 중엔 이 카드와 팀/대기자 카드가 함께 brand 보더로 강조된다. -->
      <p
        role="status"
        class="rounded-md border bg-elevated px-3 py-2 text-caption transition-colors duration-100 ease-standard"
        :class="hasSelection ? 'border-brand font-semibold text-content' : 'border-stroke text-content-secondary'"
      >
        {{ hasSelection ? '이동할 팀 카드를 터치하세요' : '칩을 눌러 선택하거나 길게 눌러 끌어 옮기세요' }}
      </p>

      <!-- 팀 그리드 -->
      <div class="grid grid-cols-2 gap-3">
        <TeamCard
          v-for="team in draftTeams"
          :key="team.armband"
          :team="team"
          :has-selection="hasSelection"
          :selected-member-id="selectedMemberId"
          @move-here="store.moveSelectedTo(team.armband)"
          @select-member="store.selectMember"
        />
      </div>
    </div>

    <!-- 미배정 대기자 — 팀 카드와 동일하게 선택 중이면 drop 타겟으로 강조하고, 칩 영역 높이를 고정한다.
         비어 있어도 항상 렌더한다: 대기자가 0명일 때 카드를 숨기면 이동 타겟(탭·드롭) 자체가 사라져
         호스트가 특정 참가자를 이번 라운드에서 제외할 방법이 없어진다(빈 팀으로 옮기면 1인 팀 ×2 보상이
         붙어 의미가 달라진다). 팀 카드의 빈 상태와 같은 규칙으로 점선 보더 + 안내 문구를 쓴다. -->
    <div
      v-bind="waitingPoolTargetAttrs"
      data-waiting-pool
      class="flex flex-col gap-2 rounded-lg border bg-elevated p-3 transition-colors duration-100 ease-standard
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      :class="waitingPoolBorderClass"
      @click="store.moveSelectedTo(null)"
      @keydown.enter.prevent="store.moveSelectedTo(null)"
      @keydown.space.prevent="store.moveSelectedTo(null)"
    >
      <p class="text-label" :class="waitingPool.length > 0 ? 'text-warning' : 'text-content-secondary'">
        미배정 대기자 {{ waitingPool.length }}명
      </p>
      <!-- data-drop-target="waiting" — Sortable 드롭 시 대기열(null)로 이동시킨다. 캡션("미배정 대기자
           N명")은 이미 이 컨테이너 밖 형제이므로 자식은 칩 버튼뿐이다. membership key(대기자 id들)로
           구성이 바뀔 때마다 재마운트해 Sortable 유령 노드를 남기지 않는다(팀 카드와 동일 원칙). -->
      <div
        :key="`waiting:${waitingPool.map((member) => member.id).join('.')}`"
        data-drop-target="waiting"
        class="flex min-h-(--pr-size-control-md) w-full flex-wrap content-center items-center gap-2"
      >
        <!-- 대기자는 미배정이므로 team=null(중립 보더) -->
        <SelectableMemberChip
          v-for="member in waitingPool"
          :key="member.id"
          :member="member"
          :team="null"
          :selected="member.id === selectedMemberId"
          @select="store.selectMember(member.id)"
        />
      </div>
      <!-- 빈 상태 안내는 드롭 컨테이너 밖 형제로 둔다 — Sortable이 옮기는 노드에 섞이면 안 된다 -->
      <p v-if="waitingPool.length === 0" class="text-caption text-content-tertiary">
        이번 라운드에서 제외할 멤버를 여기로 옮기세요
      </p>
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
          재배정은 아직 만나지 않은 사람끼리 우선 묶습니다.
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
