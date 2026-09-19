<script setup lang="ts">
import BaseCard from '@/shared/components/BaseCard.vue'
import { tierLabel } from '@/features/round-ledger'
import type { TierGroup } from '@/features/round-ledger'

/**
 * 이번 라운드 정산 미리보기(P07) — 타이머가 0에 닿아 '라운드 종료'만 남았을 때 "지금 종료하면
 * 누가 몇 포인트를 받는가"를 보여 준다. 종료 = 정산 확정이라 확인 다이얼로그(미판정 킬샷이 있을
 * 때만 뜬다)보다 앞에, 종료 버튼 옆에 항상 있어야 한다. 판정을 더 하면 값이 따라 바뀐다.
 */
interface Props {
  /** 등급 오름차순(1등급 먼저, 등급 없음 마지막) — round-ledger groupByTier + 이름 조인 */
  groups: Array<TierGroup & { names: string[] }>
}

defineProps<Props>()
</script>

<template>
  <BaseCard>
    <div class="flex flex-col gap-3">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-label text-content">이번 라운드 정산</h2>
        <p class="text-caption text-content-secondary">종료하면 확정돼요</p>
      </div>
      <ul class="flex flex-col gap-2" aria-label="등급별 포인트">
        <li v-for="group in groups" :key="group.tier" class="flex items-start gap-3">
          <!-- 등급·포인트는 폭을 고정해 이름 열이 세로로 정렬되게 한다 -->
          <span class="w-20 shrink-0 text-label tabular-nums text-content">
            {{ tierLabel(group.tier) }} · {{ group.points }}P
          </span>
          <span class="min-w-0 flex-1 text-caption break-keep text-content-secondary">
            {{ group.names.join(', ') }}
          </span>
        </li>
      </ul>
    </div>
  </BaseCard>
</template>
