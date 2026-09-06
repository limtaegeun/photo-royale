<!--
  대기실 명단의 강퇴 진입점 — 진행자에게만 렌더되는, 참가자 칩 전체를 감싸는 버튼.
  참가자 표시는 PlayerChip을 그대로 쓰고, 이 래퍼가 탭 동작(내보내기 확인 열기)과
  히트 영역 확장을 담당한다(SelectableMemberChip과 같은 소유 방식 — DESIGN_SYSTEM §6.2).
-->
<script setup lang="ts">
import { computed } from 'vue'
import PlayerChip from '@/shared/components/PlayerChip.vue'
import type { Participant } from '../api/rooms'

interface Props {
  participant: Participant
}

const props = defineProps<Props>()
defineEmits<{ kick: [] }>()

/**
 * aria-label이 버튼 안 텍스트(이름·준비 상태)를 덮으므로 상태를 라벨에 병기한다 —
 * 내보낼 사람을 고르는 쪽(진행자)이 소리만으로도 준비 여부를 들을 수 있어야 한다.
 */
const ariaLabel = computed(
  () => `${props.participant.name}(${props.participant.isReady ? '준비' : '대기'}) 내보내기`,
)
</script>

<template>
  <button
    type="button"
    :aria-label="ariaLabel"
    class="kick-hit relative block w-full rounded-full transition duration-100 ease-standard
           active:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    @click="$emit('kick')"
  >
    <PlayerChip
      :name="participant.name"
      :team="participant.team"
      :gender="participant.gender"
      :is-ready="participant.isReady"
    />
  </button>
</template>

<style scoped>
/* 히트 영역 확장 — 시각 칩(높이 40px)이 최소 터치 타겟(48px)보다 낮으므로, 버튼 자신의 ::before로
   수직 48px 탭 영역을 덧댄다(SelectableMemberChip .chip-hit와 같은 규칙 — DESIGN_SYSTEM §6.2). */
.kick-hit::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--pr-size-tap-minimum);
  transform: translateY(-50%);
}
</style>
