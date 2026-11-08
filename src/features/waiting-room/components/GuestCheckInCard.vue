<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'

interface Props {
  roomCode: string
  /** 내가 준비를 마쳤는지 — 단계가 2(지금 할 일)에서 3(진행자 팀 배정 대기)으로 넘어간다 */
  isReady: boolean
  /** 확정된 라운드 요약 — 배정 전이면 null(고르지도 않은 기본 모드를 알리지 않는다) */
  roundSummary: { round: number; modeLabel: string } | null
}

const props = defineProps<Props>()

defineEmits<{
  copyInvite: []
}>()

type StepState = 'done' | 'current' | 'pending'
type StepKey = 'enter' | 'ready' | 'assign'

interface CheckInStep {
  key: StepKey
  title: string
  caption: string | null
  state: StepState
}

/**
 * 게스트 체크인 3단계(P19 시안 C) — 입장은 이 화면에 있다는 것 자체로 끝났다. 준비 전에는 2단계가
 * 지금 할 일이고, 준비하면 3단계(진행자 팀 배정)를 기다린다. 3단계는 게스트의 행동이 아니라서
 * 끝난 표시가 없다 — 배정이 확정되면 이 카드 대신 라운드 배정 카드가 뜬다.
 */
const steps = computed<CheckInStep[]>(() => [
  { key: 'enter', title: '대기실 입장', caption: null, state: 'done' },
  {
    key: 'ready',
    title: '안전 수칙 확인하고 준비 완료',
    caption: '지금 할 일 · 아래 버튼을 눌러 주세요',
    state: props.isReady ? 'done' : 'current',
  },
  {
    key: 'assign',
    title: '진행자 팀 배정',
    caption: '팀이 정해지면 화면이 자동으로 넘어가요',
    state: props.isReady ? 'current' : 'pending',
  },
])

/** 지금 할 일 행의 강조 색 — 내 행동(2단계)은 경고색, 기다림(3단계)은 정보색. 리터럴 맵(스캐너 대응) */
const CURRENT_TONE: Record<StepKey, { ring: string; caption: string }> = {
  ready: { ring: 'border-warning text-warning', caption: 'text-warning' },
  assign: { ring: 'border-info text-info', caption: 'text-info' },
  enter: { ring: '', caption: '' },
}
</script>

<template>
  <BaseCard as="section" aria-labelledby="guest-check-in-title">
    <!-- 방 정보 카드 자리를 대신한다 — 게스트가 첫 화면에서 "내가 지금 무엇을 해야 하는가"를 본다.
         방 코드·초대는 유지하되 코드는 헤더 보조 정보로 낮춘다 -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <h2 id="guest-check-in-title" class="text-label text-content">내 체크인</h2>
        <div class="flex items-center gap-2">
          <!-- 방 코드는 받아 적어 입력하는 값이라 mono + 자간으로 0/O·1/I 오독을 줄인다 -->
          <span class="text-caption text-content-tertiary">
            ROOM
            <span class="font-mono tracking-widest text-content-secondary">{{ roomCode }}</span>
          </span>
          <BaseBadge :tone="isReady ? 'success' : 'warning'" size="sm">
            {{ isReady ? '준비 완료' : '1단계 남음' }}
          </BaseBadge>
        </div>
      </div>

      <p v-if="roundSummary !== null" class="text-caption text-content-secondary">
        {{ roundSummary.round }}차 라운드 ·
        <span class="font-semibold text-content">{{ roundSummary.modeLabel }}</span>
      </p>

      <ol class="flex flex-col gap-1">
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          :data-step="step.key"
          :data-state="step.state"
          :aria-current="step.state === 'current' ? 'step' : undefined"
          class="flex gap-3 rounded-md"
          :class="step.state === 'current' ? '-mx-3 items-start bg-surface p-3' : 'items-center py-2'"
        >
          <!-- 끝난 단계: 채운 체크 / 지금 단계: 색 테두리 번호 / 남은 단계: 회색 테두리 번호 -->
          <span
            v-if="step.state === 'done'"
            class="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-solid text-on-success"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-4"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span
            v-else
            class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-label"
            :class="step.state === 'current' ? CURRENT_TONE[step.key].ring : 'border-stroke text-content-tertiary'"
            aria-hidden="true"
          >
            {{ index + 1 }}
          </span>

          <div class="flex min-w-0 flex-col gap-1">
            <span
              :class="
                step.state === 'current'
                  ? 'text-body font-bold text-content'
                  : step.state === 'done'
                    ? 'text-label text-content-tertiary line-through'
                    : 'text-label text-content-tertiary'
              "
            >
              {{ step.title }}
            </span>
            <span
              v-if="step.state === 'current' && step.caption !== null"
              class="text-caption font-semibold break-keep"
              :class="CURRENT_TONE[step.key].caption"
            >
              {{ step.caption }}
            </span>
          </div>
        </li>
      </ol>

      <BaseButton variant="ghost" size="md" class="w-full" @click="$emit('copyInvite')">
        초대 링크 복사
      </BaseButton>
    </div>
  </BaseCard>
</template>
