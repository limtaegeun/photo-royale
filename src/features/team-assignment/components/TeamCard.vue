<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import { groupLabelEn, groupTextClass } from '../armbandStyles'
import type { DraftTeam } from '../stores/useTeamAssignmentStore'
import SelectableMemberChip from './SelectableMemberChip.vue'

/**
 * 배정 보드의 팀 카드 — 팀 헤더(완장·그룹·X 겸직) + 멤버 칩 드롭 컨테이너 + 팀 상태 표기.
 * 카드 자체가 "선택된 칩을 이 팀으로 옮기는" 드롭/탭 타겟이다.
 */
interface Props {
  team: DraftTeam
  /** 칩이 하나라도 선택된 상태 — 이때만 카드가 이동 타겟이 된다(보더 강조 + 키보드 진입) */
  hasSelection: boolean
  /** 현재 선택된 멤버 id — 이 팀에 속해 있으면 해당 칩에 선택 ring이 붙는다 */
  selectedMemberId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ moveHere: []; selectMember: [id: string] }>()

const isEmpty = computed(() => props.team.members.length === 0)
/** 1인 팀 — 목숨·포인트 2배 규칙 대상 */
const isSolo = computed(() => props.team.members.length === 1)

/**
 * 카드 보더 상태 — 4조합을 리터럴 클래스로 매핑(Tailwind 스캐너 대응).
 * 선택 중이면 drop 타겟이므로 brand 코발트 보더로 강조하고(칩 선택 ring=라임과 색을 구분),
 * 멤버가 없는 빈 팀은 채워질 자리임을 점선 보더로 표현한다.
 */
const borderClass = computed(() => {
  if (props.hasSelection) return isEmpty.value ? 'border-brand border-dashed' : 'border-brand'
  return isEmpty.value ? 'border-dashed border-stroke-strong' : 'border-stroke'
})

/**
 * 멤버 구성이 바뀔 때마다 드롭 컨테이너를 새 요소로 갈아끼우는 membership key.
 * Sortable이 옮겨 놓은(Vue 추적 밖) 노드가 유령으로 남지 않게 하는 장치다 —
 * 팀A→팀B 이동 시 원본이 팀A에 중복 잔존하던 버그의 근본 수정.
 */
const dropContainerKey = computed(
  () => `${props.team.armband}:${props.team.members.map((member) => member.id).join('.')}`,
)

/**
 * 이동 타겟이 아닐 때(=선택된 칩이 없을 때)는 role/tabindex/aria-label을 떼어낸다.
 * 항상 role="button"이면 (1) 내부 칩 버튼과 중첩 인터랙티브가 되고 (2) 아무 일도 하지 않는
 * 카드가 팀 수만큼 탭 순서를 차지한다. 카드가 실제로 눌릴 수 있을 때만 버튼으로 노출한다.
 */
const targetAttrs = computed(() =>
  props.hasSelection
    ? { role: 'button', tabindex: 0, 'aria-label': `팀 ${props.team.armband}로 이동` }
    : {},
)
</script>

<template>
  <div
    v-bind="targetAttrs"
    :data-team="team.armband"
    class="flex flex-col gap-2 rounded-lg border bg-elevated p-3 transition-colors duration-100 ease-standard
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    :class="borderClass"
    @click="emit('moveHere')"
    @keydown.enter.prevent="emit('moveHere')"
    @keydown.space.prevent="emit('moveHere')"
  >
    <!-- 팀 헤더: 팀명 + (X 겸직 배지) / 그룹 색 라벨. 완장 알파벳은 좌측 '팀A'에 이미 있으므로
         우측은 그룹 이름만 표기한다(색약 대응 라벨 병기는 그대로 유지된다). -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-label text-content">팀{{ team.armband }}</span>
        <BaseBadge v-if="team.isXTeam" tone="warning" size="sm">X</BaseBadge>
      </div>
      <span class="text-caption font-semibold" :class="groupTextClass(team.armband)">
        {{ groupLabelEn(team.armband) }}
      </span>
    </div>

    <!-- 칩 드롭 컨테이너 — 자식은 칩 버튼([data-member])뿐인 "순수 칩 리스트"다. ×2 배지·"비어 있음"
         문구를 이 안에 두지 않는 이유: Sortable이 이 컨테이너의 노드를 직접 옮기므로, 배지/문구가
         섞여 있으면 Sortable이 노드 순서를 잘못 계산해 유령이 남는다. w-full·min-h로 빈 팀도 드롭
         면적을 확보한다(빈 팀도 드롭 대상). -->
    <div
      :key="dropContainerKey"
      :data-drop-target="team.armband"
      class="flex min-h-(--pr-size-control-md) w-full flex-wrap content-center items-center gap-2"
    >
      <SelectableMemberChip
        v-for="member in team.members"
        :key="member.id"
        :member="member"
        :team="team.armband"
        :selected="member.id === selectedMemberId"
        @select="emit('selectMember', member.id)"
      />
    </div>

    <!-- 팀 상태 표기는 드롭 컨테이너 밖(카드 내 형제)에 둔다 — Sortable 자식에서 배제한다.
         self-start가 없으면 flex-col의 stretch로 배지가 카드 폭 전체까지 늘어난다. -->
    <BaseBadge v-if="isSolo" tone="warning" size="sm" class="self-start">1인 팀 ×2</BaseBadge>
    <span v-else-if="isEmpty" class="text-caption text-content-tertiary">비어 있음</span>
  </div>
</template>
