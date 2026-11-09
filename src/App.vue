<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/shared/components/AppHeader.vue'
import BaseToastProvider from '@/shared/components/BaseToastProvider.vue'
import ConnectionStatusBadge from '@/shared/components/ConnectionStatusBadge.vue'
import { useAppHeader } from '@/shared/composables/useAppHeader'
import { useAuthStore } from '@/features/auth'

const route = useRoute()
const authStore = useAuthStore()

// 헤더 타이틀·설명 — 기본값은 라우트 meta, 페이지가 setHeader로 덮어쓰면 그 값이 우선한다.
// 이탈 링크는 meta가 정하고, 페이지가 setBackAction을 걸면 같은 자리에 그 하위 화면을 닫는 버튼이 대신 뜬다
const {
  title: headerTitle,
  description: headerDescription,
  backAction: headerBackAction,
  hidden: headerHidden,
} = useAppHeader()

const appHeaderVisible = computed(() => !route.meta.hideAppHeader && !headerHidden.value)
</script>

<template>
  <!-- 앱 셸 — 모바일 뷰포트를 데스크톱에선 가운데 정렬해 폭을 제한 -->
  <div class="flex min-h-dvh justify-center bg-canvas">
    <main class="flex w-full max-w-md flex-col">
      <!-- 공용 헤더 — 카메라 콕핏 등 풀스크린 라우트는 meta.hideAppHeader로, 한 라우트 안의 특정 탭은
           setHeaderHidden으로 제외 -->
      <AppHeader
        v-if="appHeaderVisible"
        :show-profile-link="authStore.isLoggedIn"
        :title="headerTitle ?? route.meta.appHeaderTitle"
        :description="headerDescription ?? route.meta.appHeaderDescription"
        :back-to="route.meta.appHeaderBackTo"
        :back-label="headerBackAction?.label ?? route.meta.appHeaderBackLabel"
        :show-back-button="headerBackAction !== undefined"
        @back="headerBackAction?.run()"
      />
      <RouterView />
    </main>
  </div>

  <!-- 전역 토스트 — 어느 기능에서든 useToast().toast(...)로 발행 -->
  <BaseToastProvider />
  <!-- '연결 중' — 실시간 화면의 연결 감시가 서버와 다시 연결하는 동안만 뜬다 -->
  <ConnectionStatusBadge :beside-header="appHeaderVisible" />
</template>
