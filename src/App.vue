<script setup lang="ts">
import BaseToastProvider from '@/shared/components/BaseToastProvider.vue'
</script>

<template>
  <!-- 앱 셸 — 모바일 뷰포트를 데스크톱에선 가운데 정렬해 폭을 제한 -->
  <div class="flex min-h-dvh justify-center bg-canvas">
    <main class="w-full max-w-md">
      <RouterView />
    </main>
  </div>

  <!-- 전역 토스트 — 어느 기능에서든 useToast().toast(...)로 발행 -->
  <BaseToastProvider />
</template>
