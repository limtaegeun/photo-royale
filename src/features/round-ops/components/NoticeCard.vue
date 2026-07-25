<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseListRow from '@/shared/components/BaseListRow.vue'
import type { Notice } from '../api/notices'

/**
 * 공지 전송 행 — 진행자가 "마지막으로 무엇을 보냈는지"를 확인하고 다음 공지를 여는 자리.
 * 이력 전체는 후속(기록 탭)이 담당하므로 여기서는 최근 1건만 미리보기로 보여준다.
 */
interface Props {
  /** 최근 공지 1건. 아직 보낸 적이 없으면 null */
  notice: Notice | null
  /** 상대 시각 계산 기준 — 라운드 타이머의 1초 tick을 그대로 쓴다(타이머를 따로 돌리지 않는다) */
  nowMs: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 공지 작성 시트 열기 */
  open: []
}>()

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** 진행 중 화면이라 절대 시각보다 "얼마나 지났는지"가 중요하다 */
function formatRelativeTime(createdAtMs: number | null, nowMs: number): string {
  // serverTimestamp 반영 전(null)은 방금 보낸 것이다 — 전송 직후 한 틱의 로컬 스냅샷
  if (createdAtMs === null) return '방금'
  const elapsedMs = Math.max(0, nowMs - createdAtMs)
  if (elapsedMs < MINUTE_MS) return '방금'
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}분 전`
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}시간 전`
  return `${Math.floor(elapsedMs / DAY_MS)}일 전`
}

// 시각을 앞에 두어 한 줄로 잘려도 언제 보낸 공지인지는 남게 한다
const caption = computed(() =>
  props.notice === null
    ? '아직 보낸 공지가 없어요.'
    : `${formatRelativeTime(props.notice.createdAtMs, props.nowMs)} · ${props.notice.text}`,
)
</script>

<template>
  <!-- 행이 자체 패딩을 갖는 리스트 카드라 padding="none" -->
  <BaseCard padding="none">
    <BaseListRow label="공지 전송" :caption="caption">
      <template #control>
        <BaseButton variant="ghost" size="sm" @click="emit('open')">공지 보내기</BaseButton>
      </template>
    </BaseListRow>
  </BaseCard>
</template>
