<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseDialog from '@/shared/components/BaseDialog.vue'
import { formatClock } from '@/shared/utils/formatClock'
import type { EliminationNotice } from '../eliminationNotice'

/**
 * 탈락 안내 창(P22) — 우리 팀이 잡힌 순간 팀원 전원의 콕핏에 뜬다. 잡은 팀·판정 시각·판정 사진·할 일을 보이고,
 * 확인(또는 닫기·바깥 누르기)을 받을 때까지 남는다. 1인 팀의 첫 피격은 탈락이 아니라 남은 목숨을 알린다.
 *
 * 사진은 우리 팀이 찍힌 판정 사진이다. 기록 시트처럼 확대·저장 경로를 두지 않는다(P08 결정 6의 노출 범위).
 */
interface Props {
  /** 지금 띄울 안내 — null이면 닫힌다 */
  notice: EliminationNotice | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ acknowledge: [] }>()

/** 닫히는 페이드 동안에도 내용이 비지 않게 마지막 안내를 붙잡아 둔다 */
const shown = shallowRef<EliminationNotice | null>(props.notice)
watch(
  () => props.notice,
  (notice) => {
    if (notice !== null) shown.value = notice
  },
)

const open = computed({
  get: () => props.notice !== null,
  set: (value) => {
    if (!value) emit('acknowledge')
  },
})

const isOut = computed(() => shown.value?.kind !== 'hit')
const isGroupOut = computed(() => shown.value?.kind === 'group-out')
const TITLE = { out: '우리 팀이 탈락했어요', hit: '한 번 찍혔어요', 'group-out': '우리 그룹 왕이 잡혔어요' } as const
const title = computed(() => TITLE[shown.value?.kind ?? 'out'])
const description = computed(() => {
  const notice = shown.value
  if (notice === null) return undefined
  const by =
    notice.kind === 'group-out'
      ? `우리 그룹 왕(팀 ${notice.kingTeam})이 팀 ${notice.attackerTeam}에게 잡혔어요.`
      : `팀 ${notice.attackerTeam}의 킬샷으로 판정됐어요.`
  return notice.judgedAtMs === null ? by : `${formatClock(notice.judgedAtMs)}에 ${by}`
})
const photoAlt = computed(() =>
  isGroupOut.value ? '우리 그룹 왕이 찍힌 판정 사진' : '우리 팀이 찍힌 판정 사진',
)
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :description="description">
    <div v-if="shown !== null" class="flex flex-col gap-4" :data-elimination-notice="shown.kind">
      <!-- 우리 팀이 찍힌 판정 사진 — 진행자는 팀만 고르므로 누가 찍혔는지는 사진으로 알린다 -->
      <img
        :src="shown.photo"
        :alt="photoAlt"
        decoding="async"
        class="aspect-4/3 w-full rounded-md border border-stroke object-cover"
      />
      <p
        v-if="shown.isTripleKill"
        class="text-caption text-pretty break-keep text-warning"
      >
        팀원과 떨어진 채 찍혀 상대 팀이 3배 점수를 받았어요.
      </p>
      <!-- 노션 ② 기본 규칙 4 "킬샷을 맞으면 DEAD예요. 바로 베이스캠프로 돌아가요." -->
      <template v-if="isOut">
        <p v-if="isGroupOut" class="text-body text-pretty break-keep text-content">
          그룹 전체가 이번 판에서 즉시 아웃이에요.
        </p>
        <p class="text-body text-pretty break-keep text-content-secondary">
          이번 라운드는 촬영할 수 없어요. 바로 베이스캠프로 돌아가요.
        </p>
      </template>
      <div v-else class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <BaseBadge tone="warning">목숨 {{ shown.livesLeft }}개 남음</BaseBadge>
        </div>
        <p class="text-body text-pretty break-keep text-content-secondary">
          한 번 더 찍히면 탈락해요.
        </p>
      </div>
      <BaseButton variant="primary" size="lg" class="w-full" @click="open = false">확인</BaseButton>
    </div>
  </BaseDialog>
</template>
