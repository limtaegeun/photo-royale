<!--
  누적 순위 카드(P07) — 라운드 사이 전원이 대기실로 돌아오므로 여기가 순위 발표 무대다.
  상위 몇 명만 카드에 두고 전체는 바텀 시트로 강등한다(MyRoomList와 같은 progressive disclosure).
  내가 상위권 밖이면 내 줄을 따로 붙여 "나는 몇 위인가"를 스크롤 없이 답한다.
-->
<script setup lang="ts">
import { computed } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import type { Standing } from '@/features/round-ledger'

/** 순위 한 줄 — round-ledger의 Standing에 대기실이 이름·본인 여부를 붙인 것 */
export interface StandingRow extends Standing {
  name: string
  isMe: boolean
}

interface Props {
  /** 순위순(round-ledger가 정렬) */
  rows: StandingRow[]
  /** 정산이 끝난 라운드 수 — "N라운드 정산" 근거 */
  settledRoundCount: number
}

const props = defineProps<Props>()

/** 카드에 바로 보이는 상위 줄 수 — 그 아래는 시트로 */
const TOP_COUNT = 5

const topRows = computed(() => props.rows.slice(0, TOP_COUNT))
/** 상위권 밖의 내 줄 — 상위권 안이면 이미 보이므로 null */
const myRowBelowTop = computed(() => {
  const mine = props.rows.find((row) => row.isMe)
  return mine !== undefined && !topRows.value.includes(mine) ? mine : null
})
const hiddenCount = computed(() => Math.max(props.rows.length - TOP_COUNT, 0))

/** 라운드별 내역 한 줄 — "1R 2등급 · 2R 1등급". 등급 없음(0점 이하)은 '0점' */
function formatRounds(row: StandingRow): string {
  return row.rounds
    .map((entry) => `${entry.roundNo}R ${entry.tier === 0 ? '0점' : `${entry.tier}등급`}`)
    .join(' · ')
}
</script>

<template>
  <BaseCard>
    <div class="flex flex-col gap-3">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-label text-content">누적 순위</h2>
        <p class="text-caption text-content-secondary">{{ settledRoundCount }}라운드 정산</p>
      </div>

      <!-- 순위·이름·포인트 3열. 포인트는 tabular로 자리 정렬 -->
      <ol class="flex flex-col gap-2" aria-label="상위 순위">
        <li
          v-for="row in topRows"
          :key="row.uid"
          class="flex items-center gap-3"
          :class="row.isMe ? 'text-content' : 'text-content-secondary'"
          :aria-current="row.isMe ? 'true' : undefined"
        >
          <span class="w-6 shrink-0 text-label tabular-nums">{{ row.rank }}</span>
          <span class="min-w-0 flex-1 truncate text-body" :class="{ 'font-semibold': row.isMe }">
            {{ row.name }}<span v-if="row.isMe" class="text-caption text-content-tertiary"> (나)</span>
          </span>
          <span class="shrink-0 text-label tabular-nums">{{ row.points }}P</span>
        </li>
      </ol>

      <!-- 상위권 밖의 나 — 구분선 아래 한 줄 -->
      <div
        v-if="myRowBelowTop !== null"
        class="flex items-center gap-3 border-t border-stroke pt-2 text-content"
        aria-current="true"
      >
        <span class="w-6 shrink-0 text-label tabular-nums">{{ myRowBelowTop.rank }}</span>
        <span class="min-w-0 flex-1 truncate text-body font-semibold">
          {{ myRowBelowTop.name }}<span class="text-caption text-content-tertiary"> (나)</span>
        </span>
        <span class="shrink-0 text-label tabular-nums">{{ myRowBelowTop.points }}P</span>
      </div>

      <BaseBottomSheet v-if="hiddenCount > 0 || rows.some((row) => row.rounds.length > 1)" title="누적 순위 전체">
        <template #trigger>
          <BaseButton variant="ghost" size="md" class="w-full">
            전체 보기 ({{ rows.length }}명)
          </BaseButton>
        </template>
        <ol class="flex flex-col divide-y divide-stroke" aria-label="전체 순위">
          <li
            v-for="row in rows"
            :key="row.uid"
            class="flex items-center gap-3 py-3"
            :class="row.isMe ? 'text-content' : 'text-content-secondary'"
            :aria-current="row.isMe ? 'true' : undefined"
          >
            <span class="w-6 shrink-0 text-label tabular-nums">{{ row.rank }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-body" :class="{ 'font-semibold': row.isMe }">
                {{ row.name }}<span v-if="row.isMe" class="text-caption text-content-tertiary"> (나)</span>
              </p>
              <!-- 라운드별 등급 — 동점일 때 "왜 이 순서인가"의 근거(원점수 합)까지는 여기서 보이지
                   않지만, 등급 내역만으로 대부분 설명된다 -->
              <p class="truncate text-caption text-content-tertiary">
                {{ formatRounds(row) }} · 원점수 {{ row.rawScore }}
              </p>
            </div>
            <span class="shrink-0 text-label tabular-nums">{{ row.points }}P</span>
          </li>
        </ol>
      </BaseBottomSheet>
    </div>
  </BaseCard>
</template>
