<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseListRow from '@/shared/components/BaseListRow.vue'
import type { Notice } from '../api/notices'
import { formatRelativeTime } from '../relativeTime'

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
