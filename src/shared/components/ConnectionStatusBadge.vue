<script setup lang="ts">
import BaseBadge from './BaseBadge.vue'
import { useFirestoreConnectionStatus } from '@/shared/composables/useFirestoreConnectionStatus'

/**
 * 실시간 화면이 서버와 다시 연결하는 동안 뜨는 '연결 중' 표시 — App.vue가 한 번만 마운트한다.
 * 값은 연결 감시(useFirestoreWatchdog)가 정해서, 실시간 화면(대기실·라운드 운영·콕핏) 밖에서는 뜨지 않는다.
 * 공지와 게임 종료가 멈춘 것처럼 보이는 동안 사용자가 새로고침부터 누르지 않게 한다.
 */
const { reconnecting } = useFirestoreConnectionStatus()
</script>

<template>
  <!-- 라이브 영역은 늘 두고 안의 표시만 바꾼다 — 나중에 생긴 role="status" 는 스크린 리더가 읽지 않을 수 있다.
       토스트와 같은 층의 상단 안전 영역 아래에 두고, 클릭은 통과시켜 아래 화면의 조작을 막지 않는다 -->
  <div
    role="status"
    class="pointer-events-none fixed inset-x-0 top-0 z-(--pr-z-toast) mx-auto flex w-full max-w-md justify-center
           px-4 pt-[calc(var(--pr-inset-top-safe)+0.5rem)]"
  >
    <BaseBadge v-if="reconnecting" tone="warning" size="md" class="gap-2" data-testid="connection-status-badge">
      <span
        aria-hidden="true"
        class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-pulse"
      />
      연결 중
    </BaseBadge>
  </div>
</template>
