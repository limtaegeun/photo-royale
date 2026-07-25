<script setup lang="ts">
import PlayerChip from '@/shared/components/PlayerChip.vue'
import type { DraftMember } from '../stores/useTeamAssignmentStore'

/**
 * 배정 보드의 선택 가능한 멤버 칩 — 팀 카드와 미배정 대기자가 공유한다.
 * 참가자 표시는 대기실과 동일한 PlayerChip을 쓰고, 이 래퍼가 선택 상태(ring)와 드래그 핸들
 * (data-member)을 담당한다. 시각 트랙(칩 40px)이 최소 터치 타겟보다 낮으므로 히트 영역을
 * ::before로 48px까지 확장한다.
 */
interface Props {
  member: DraftMember
  /** 소속 완장 — 팀 카드 안이면 그룹 보더 색을 입히고, 미배정 대기자는 null(중립 보더) */
  team: string | null
  selected: boolean
}

defineProps<Props>()
defineEmits<{ select: [] }>()
</script>

<template>
  <!-- 선택 ring은 ring-offset(카드색 bg-elevated)로 칩 팀 보더와 1칸 띄워 '이중 테두리(계란프라이)'를
       없앤다. 래퍼가 칩(rounded-full)을 그대로 감싸므로 배경·ring이 칩 모양을 따른다.
       @click.stop — 팀 카드(드롭 타겟)의 이동 클릭으로 버블링되지 않게 막는다. -->
  <button
    type="button"
    :aria-pressed="selected"
    :data-member="member.id"
    :data-selected="selected"
    class="chip-hit relative inline-flex items-center rounded-full
           transition duration-100 ease-standard
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    :class="selected ? 'bg-surface ring-2 ring-accent ring-offset-2 ring-offset-elevated' : ''"
    @click.stop="$emit('select')"
  >
    <PlayerChip :name="member.name" :team="team" :gender="member.gender" />
  </button>
</template>

<style scoped>
/* 히트 영역 확장 — 시각 칩(높이 40px)이 최소 터치 타겟(48px)보다 낮으므로, 래퍼 자신의 ::before로
   수직 48px 탭 영역을 덧댄다(폭은 칩 폭으로 충분). 레이아웃에 영향 없고(absolute),
   래퍼가 버튼이라 ::before 위의 탭도 칩 선택으로 전달된다. */
.chip-hit::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--pr-size-tap-minimum);
  transform: translateY(-50%);
}

/* 드래그 상태 클래스는 Sortable이 런타임에 이 루트에 붙인다(보드의 ghostClass/chosenClass 옵션).
   칩이 팀 카드·대기자 어디에 렌더돼도 같은 규칙이 적용되도록 클래스 소유자와 같은 파일에 둔다. */

/* 드래그 중 원위치에 남는 고스트 — 반투명으로 "여기서 출발"을 표시(색은 원 칩 색 유지, 투명도만 조절) */
.member-ghost {
  opacity: 0.4;
}

/* 집어 든 칩 — 살짝 키워 들려 있는 느낌만 준다(색값 도입 없이 transform만) */
.member-chosen {
  transform: scale(1.05);
}
</style>
