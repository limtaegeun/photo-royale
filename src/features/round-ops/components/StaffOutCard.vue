<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseListRow from '@/shared/components/BaseListRow.vue'

/**
 * 스태프 추격전(P07 §4.5) 전용 행 — 스태프의 태그는 참가자 제출 경로(킬샷)로 들어오지 않으므로
 * 진행자가 직접 아웃을 기록하는 자리. 여기서는 생존 현황만 보여주고, 실제 선택은
 * StaffOutSheet가 맡는다(운영 탭이 항상 최신 원장 값을 내려준다).
 */
interface Props {
  /** 아직 아웃되지 않은 팀 수 */
  aliveCount: number
  /** 이번 라운드 전체 팀 수 */
  teamCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 아웃 처리 시트 열기 */
  open: []
}>()

const caption = computed(
  () => `생존 ${props.aliveCount} / ${props.teamCount}팀 · 스태프에게 잡힌 팀을 아웃으로 기록해요.`,
)
</script>

<template>
  <!-- 행이 자체 패딩을 갖는 리스트 카드라 padding="none" -->
  <BaseCard padding="none">
    <BaseListRow label="스태프 아웃 처리" :caption="caption">
      <template #control>
        <BaseButton variant="ghost" size="sm" @click="emit('open')">아웃 처리</BaseButton>
      </template>
    </BaseListRow>
  </BaseCard>
</template>
