<script setup lang="ts">
import BaseBadge from '@/shared/components/BaseBadge.vue'
import { groupSolidBgClass } from '@/features/team-assignment'
import type { TeamPickOption, TeamPickSection } from '../teamSections'

/**
 * 판정 시트(JudgeSheet)·스태프 아웃 시트(StaffOutSheet)가 공유하는 팀 선택 목록 — 그룹 섹션
 * 마크업만 이 컴포넌트가 갖고, 어떤 팀을 왜 선택할 수 없는지(배지·캡션·disabled)는 호출부가
 * 옵션에 실어 보낸다.
 */
interface Props {
  sections: TeamPickSection[]
  selected: string | null
  /** 쓰기 진행 중 — 전 행을 잠근다 */
  locked: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [option: TeamPickOption]
}>()

/**
 * 옵션 행 상태별 클래스 — 보더 "폭"은 어느 상태에서도 1px로 고정하고 색만 바꾼다
 * (GameModePicker와 같은 이유: 선택을 옮길 때 행 높이가 흔들리지 않게).
 */
const OPTION_CLASS = {
  disabled: 'border border-stroke',
  selected: 'border border-accent bg-surface',
  selectable: 'border border-stroke-strong',
} as const

function optionClass(option: TeamPickOption): string {
  if (option.disabled) return OPTION_CLASS.disabled
  return props.selected === option.armband ? OPTION_CLASS.selected : OPTION_CLASS.selectable
}

function chooseTeam(option: TeamPickOption) {
  if (option.disabled || props.locked) return
  emit('select', option)
}
</script>

<template>
  <section v-for="section in sections" :key="section.group" class="flex flex-col gap-2">
    <h4 class="text-caption" :class="section.textClass">{{ section.label }} 그룹</h4>
    <ul class="flex flex-col gap-2">
      <li v-for="option in section.teams" :key="option.armband">
        <button
          type="button"
          :data-team="option.armband"
          :aria-pressed="selected === option.armband"
          :disabled="option.disabled || locked"
          :aria-disabled="option.disabled || locked"
          class="flex min-h-(--pr-size-control-md) w-full items-center gap-3 rounded-md
                 px-4 py-2 text-left transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                 disabled:cursor-default"
          :class="optionClass(option)"
          @click="chooseTeam(option)"
        >
          <!-- 그룹 색 표식 — 의미는 옆의 완장·그룹 텍스트가 함께 전달한다 -->
          <span
            aria-hidden="true"
            class="size-3 shrink-0 rounded-full"
            :class="groupSolidBgClass(option.armband)"
          ></span>
          <span
            class="shrink-0 text-label"
            :class="option.disabled ? 'text-content-disabled' : 'text-content'"
          >
            팀 {{ option.armband }}
          </span>
          <span
            class="min-w-0 flex-1 truncate text-caption"
            :class="option.disabled ? 'text-content-disabled' : 'text-content-secondary'"
          >
            {{ option.memberNames }}
          </span>
          <span v-if="option.caption" class="shrink-0 text-caption text-content-secondary">
            {{ option.caption }}
          </span>
          <BaseBadge
            v-if="option.badge"
            :tone="option.badge.tone"
            :appearance="option.badge.appearance"
            class="shrink-0"
          >
            {{ option.badge.text }}
          </BaseBadge>
        </button>
      </li>
    </ul>
  </section>
</template>
