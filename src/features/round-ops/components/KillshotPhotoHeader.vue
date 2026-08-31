<script setup lang="ts">
import BaseBadge from '@/shared/components/BaseBadge.vue'
import { displayGroup } from '@/features/team-assignment'
import { teamChipLabel } from '../submissionDisplay'
import { formatRelativeTime } from '../relativeTime'

/**
 * 킬샷 사진 + 제출 정보(팀 배지·제출자명·제출 시각) 헤더 — JudgeSheet(판정 시트)와
 * RecordDetailSheet(상세 시트)가 사진 위에 얹는 마크업이 완전히 같아 여기로 묶는다.
 * 기본 슬롯은 정보 행 바로 아래 밀착해 보일 보조 콘텐츠용(RecordDetailSheet의 팀원 구성).
 */
interface Props {
  photo: string
  /** 대체 텍스트 — 시트 목적에 따라 다르다(판정할 킬샷/제출된 킬샷) */
  photoAlt: string
  team: string
  submitterName: string
  createdAtMs: number | null
  nowMs: number
}

defineProps<Props>()
</script>

<template>
  <div class="flex flex-col gap-5">
    <img
      :src="photo"
      :alt="photoAlt"
      class="max-h-72 w-full rounded-lg border border-stroke bg-surface object-contain"
    />

    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <BaseBadge :team="displayGroup(team) ?? undefined">
          {{ teamChipLabel(team) }}
        </BaseBadge>
        <span class="min-w-0 truncate text-label text-content">{{ submitterName }}</span>
        <span class="ml-auto shrink-0 text-caption text-content-secondary">
          {{ formatRelativeTime(createdAtMs, nowMs) }} 제출
        </span>
      </div>
      <slot />
    </div>
  </div>
</template>
