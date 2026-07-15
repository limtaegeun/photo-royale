<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppHeader from '@/shared/components/AppHeader.vue'
import BaseToastProvider from '@/shared/components/BaseToastProvider.vue'
import { useAuthStore } from '@/features/auth'

const route = useRoute()
const authStore = useAuthStore()
</script>

<template>
  <!-- 앱 셸 — 모바일 뷰포트를 데스크톱에선 가운데 정렬해 폭을 제한 -->
  <div class="flex min-h-dvh justify-center bg-canvas">
    <main class="flex w-full max-w-md flex-col">
      <!-- 공용 헤더 — 카메라 콕핏 등 풀스크린 라우트는 meta.hideAppHeader로 제외 -->
      <AppHeader v-if="!route.meta.hideAppHeader" :show-profile-link="authStore.isLoggedIn" />
      <RouterView />
    </main>
  </div>

  <!-- 전역 토스트 — 어느 기능에서든 useToast().toast(...)로 발행 -->
  <BaseToastProvider />
</template>
