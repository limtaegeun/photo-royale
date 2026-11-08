<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'

interface Props {
  /** 누를 수 있을 때의 버튼 문구 — 뷰마다 다르다(기본 뷰는 안전 수칙 동의, 배정 카드 뷰는 라운드 준비) */
  label: string
  isReady: boolean
  isConfirming: boolean
  error: string | null
  readyCount: number
  participantCount: number
  /** 라운드 배정 카드 뷰인지 — 준비한 뒤 기다리는 대상이 팀 배정이 아니라 게임 시작이다 */
  isAssigned: boolean
}

const props = defineProps<Props>()

defineEmits<{
  confirm: []
}>()

/**
 * 버튼 위 안내(P19 시안 A) — 진행자는 배정·게임 시작 모두 전원 준비를 기다린다(store.canStartGame).
 * 기본 뷰에서 준비를 마치면 다음은 팀 배정이라 그걸 기다린다고 알린다. 배정 카드 뷰는 준비 뒤에도
 * 진행자가 나머지 사람을 기다리는 중이라 같은 문장을 유지한다.
 */
const caption = computed(() =>
  props.isReady && !props.isAssigned
    ? '팀 배정을 기다리는 중이에요'
    : '진행자가 전원 준비를 기다리고 있어요',
)

/** 준비 인원 진행률 — 명단이 비는 순간(구독 전)에도 0으로 나누지 않는다 */
const progressWidth = computed(() => {
  if (props.participantCount === 0) return '0%'
  return `${Math.min(100, (props.readyCount / props.participantCount) * 100)}%`
})
</script>

<template>
  <div
    class="pointer-events-none sticky bottom-0 z-(--pr-z-hud) -mx-6 px-6 pt-6 pb-[calc(var(--pr-inset-bottom-safe)+1rem)]"
    data-testid="guest-ready-bar"
  >
    <!-- 플로팅 준비 바 — 40명 방에서는 명단이 길어 흐름 끝의 버튼이 첫 화면에 없었다(P19).
         sticky라 스크롤 중엔 화면 하단에 붙어 있고, 끝까지 내리면 제자리(콘텐츠 아래)에 놓인다.
         바 자체는 터치를 통과시키고 안쪽만 받는다 — 위쪽 페이드 띠가 뒤 콘텐츠의 터치를 먹지 않게.
         iOS 홈 인디케이터를 피하도록 safe-area를 바 안쪽 여백에 더한다(앱 헤더의 상단 인셋과 같은 방식) -->
    <!-- 배경: 위 24px는 콘텐츠가 바 아래로 스며들게 페이드, 나머지는 캔버스로 덮는다 -->
    <div class="absolute inset-0 -z-10 flex flex-col" aria-hidden="true">
      <div class="h-6 shrink-0 bg-linear-to-b from-transparent to-canvas"></div>
      <div class="flex-1 bg-canvas"></div>
    </div>

    <div class="pointer-events-auto flex flex-col gap-3">
      <p v-if="error" class="text-caption text-danger" role="alert">{{ error }}</p>

      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-3">
          <p
            class="min-w-0 text-caption font-semibold break-keep"
            :class="isReady ? 'text-content-secondary' : 'text-warning'"
          >
            {{ caption }}
          </p>
          <p class="shrink-0 text-caption font-bold text-content">
            {{ readyCount }}/{{ participantCount }}
          </p>
        </div>
        <!-- 숫자가 같은 정보를 글자로 말하므로 막대는 낭독기에서 숨긴다 -->
        <div class="h-1 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div
            class="h-1 rounded-full transition-[width] duration-200 ease-standard"
            :class="isReady ? 'bg-success-solid' : 'bg-accent'"
            :style="{ width: progressWidth }"
          ></div>
        </div>
      </div>

      <BaseButton
        v-if="!isReady"
        variant="accent"
        size="lg"
        class="w-full"
        :loading="isConfirming"
        @click="$emit('confirm')"
      >
        {{ label }}
      </BaseButton>
      <!-- 누른 뒤엔 회색 비활성 버튼 대신 끝났다는 상태를 보인다 — 비활성은 "아직 못 누른다"로 읽혔다 -->
      <div
        v-else
        role="status"
        class="flex h-(--pr-size-control-lg) items-center justify-center gap-2 rounded-md border border-success text-body font-semibold text-success"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-5"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        준비 완료
      </div>
    </div>
  </div>
</template>
