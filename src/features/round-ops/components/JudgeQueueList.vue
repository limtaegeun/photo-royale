<script setup lang="ts">
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import { displayGroup, groupLabelKo } from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import type { Submission } from '../api/submissions'
import { formatRelativeTime } from '../relativeTime'

/**
 * 판정 대기 큐 — 참가자들이 제출한 킬샷을 오래된 순으로 나열한다. 행을 누르면 판정 시트가
 * 열린다(판정 자체는 호출부가 시트로 수행). 판정된 건은 pending 구독에서 자연히 빠진다.
 */
interface Props {
  /** 판정 대기 킬샷 — 오래된 순 정렬(api가 보장) */
  submissions: Submission[]
  /** 제출자 이름 조인용 명단 — 문서 ID=uid라 항상 찾을 수 있다(퇴장 삭제 플로우 없음) */
  participants: Participant[]
  /** 상대 시각 계산 기준 — 라운드 타이머의 1초 tick을 그대로 쓴다 */
  nowMs: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 판정 시트 열기 */
  select: [submission: Submission]
}>()

/** 명단 유실(경계 상황) 시에도 큐가 깨지지 않게 안전 문구로 흡수한다 */
function submitterName(uid: string): string {
  return props.participants.find((participant) => participant.id === uid)?.name ?? '알 수 없음'
}

/** 색+라벨 병기 규칙 — 완장 알파벳과 그룹 한글 라벨을 항상 함께 쓴다 */
function teamChipLabel(team: string): string {
  const label = groupLabelKo(team)
  return label === '' ? `팀 ${team}` : `팀 ${team} · ${label}`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseSectionHeader title="판정" summary="사진 속 완장의 팀을 확인해 판정해 주세요.">
      <template #aside>
        <BaseBadge :tone="submissions.length > 0 ? 'warning' : 'neutral'" appearance="outline">
          대기 {{ submissions.length }}건
        </BaseBadge>
      </template>
    </BaseSectionHeader>

    <BaseCard v-if="submissions.length === 0" padding="lg">
      <div class="flex flex-col gap-2">
        <p class="text-body text-content-secondary">판정 대기 중인 킬샷이 없어요.</p>
        <p class="text-caption break-keep text-content-tertiary">
          참가자가 킬샷을 제출하면 이곳에 오래된 순으로 모여요.
        </p>
      </div>
    </BaseCard>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="submission in submissions" :key="submission.id">
        <button
          type="button"
          :data-submission="submission.id"
          class="flex min-h-(--pr-size-control-lg) w-full items-center gap-3 rounded-lg border
                 border-stroke bg-elevated p-3 text-left transition-colors duration-100
                 ease-standard focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-brand"
          @click="emit('select', submission)"
        >
          <!-- 정보(팀·이름·시각)는 텍스트로 전달하므로 썸네일은 장식으로 둔다 -->
          <img
            :src="submission.photo"
            alt=""
            aria-hidden="true"
            class="size-16 shrink-0 rounded-md border border-stroke bg-surface object-cover"
          />
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <BaseBadge
              :team="displayGroup(submission.team) ?? undefined"
              class="self-start"
            >
              {{ teamChipLabel(submission.team) }}
            </BaseBadge>
            <span class="truncate text-label text-content">{{ submitterName(submission.uid) }}</span>
            <span class="text-caption text-content-secondary">
              {{ formatRelativeTime(submission.createdAtMs, nowMs) }} 제출
            </span>
          </span>
          <svg
            aria-hidden="true"
            class="size-4 shrink-0 text-content-tertiary"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="m6 4 4 4-4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>
