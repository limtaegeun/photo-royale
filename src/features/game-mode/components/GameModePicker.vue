<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import { GAME_MODE_IDS, GAME_MODES } from '../registry'
import type { GameModeId } from '../types'

/**
 * 게임 모드 선택 하단 시트 — 레지스트리(GAME_MODE_IDS 순서)를 그대로 나열하고 현재 선택을
 * 강조한다. 모드 목록을 쓰는 화면이 늘어나도 옵션 행 마크업이 복제되지 않게 game-mode 기능이
 * 소유한다(호출부는 열림 상태와 선택 결과만 다룬다).
 */
interface Props {
  /** 현재 선택된 모드 — 목록에서 강조된다 */
  selected: GameModeId
}

defineProps<Props>()
const emit = defineEmits<{ select: [id: GameModeId] }>()

const open = defineModel<boolean>('open', { default: false })

/** 시트에 순서대로 나열할 모드 정의 목록 */
const modeOptions = computed(() => GAME_MODE_IDS.map((id) => GAME_MODES[id]))

/** 모드 선택 — 결과만 알리고 시트를 닫는다(드래프트 반영은 호출부 책임) */
function choose(id: GameModeId) {
  emit('select', id)
  open.value = false
}

/**
 * 옵션 행 상태별 클래스 — 보더 "폭"은 어느 상태에서도 1px로 고정하고 색만 바꾼다.
 * 선택 상태만 border-2로 두면 선택을 옮길 때마다 행 높이가 1px씩 흔들린다(레이아웃 시프트).
 */
const STATE_CLASS = {
  unavailable: 'border border-stroke',
  selected: 'border border-accent bg-surface',
  selectable: 'border border-stroke-strong',
} as const

function stateClass(mode: (typeof modeOptions.value)[number], isSelected: boolean): string {
  if (!mode.available) return STATE_CLASS.unavailable
  return isSelected ? STATE_CLASS.selected : STATE_CLASS.selectable
}
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="게임 모드 선택">
    <ul class="flex flex-col gap-2">
      <li v-for="mode in modeOptions" :key="mode.id">
        <button
          type="button"
          :data-mode="mode.id"
          :aria-pressed="mode.id === selected"
          :disabled="!mode.available"
          :aria-disabled="!mode.available"
          class="flex min-h-(--pr-size-control-md) w-full flex-col items-start justify-center gap-1
                 rounded-md px-4 py-2 text-left transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                 disabled:cursor-default"
          :class="stateClass(mode, mode.id === selected)"
          @click="choose(mode.id)"
        >
          <span class="flex items-center gap-2">
            <span
              class="text-label"
              :class="mode.available ? 'text-content' : 'text-content-disabled'"
            >
              {{ mode.label }}
            </span>
            <BaseBadge v-if="!mode.available" tone="neutral" size="sm">준비 중</BaseBadge>
          </span>
          <span
            class="text-caption"
            :class="mode.available ? 'text-content-secondary' : 'text-content-disabled'"
          >
            {{ mode.description }}
          </span>
        </button>
      </li>
    </ul>
  </BaseBottomSheet>
</template>
