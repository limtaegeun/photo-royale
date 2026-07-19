<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import LoginForm from './components/LoginForm.vue'
import { useAuthRedirect } from './composables/useAuthRedirect'

const router = useRouter()

// 가드가 보존한 목적지(?redirect=)와 공유 초대 코드(?code=)를 인증 플로우 내내 유지한다.
// 로그인 성공 시점엔 onAuthStateChanged가 useAuthStore를 갱신하므로 바로 복귀시키면 된다.
const { authQuery, redirectAfterAuth } = useAuthRedirect()
</script>

<template>
  <!-- 로그인 — 앱 셸(App.vue)이 max-w-md 가운데 정렬을 제공하므로 여기선 세로 레이아웃만 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-8 pb-(--pr-inset-bottom-safe)">
    <header class="mb-8">
      <h1 class="text-heading text-content">로그인</h1>
      <p class="mt-1 text-caption text-content-secondary">다시 만나서 반가워요.</p>
    </header>
    <LoginForm @success="redirectAfterAuth" />
    <BaseButton
      variant="ghost"
      size="md"
      class="mt-3 w-full"
      @click="router.push({ name: 'signup', query: authQuery })"
    >
      계정 만들기
    </BaseButton>
  </section>
</template>
