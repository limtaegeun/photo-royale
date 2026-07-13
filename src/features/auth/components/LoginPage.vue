<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import LoginForm from './LoginForm.vue'

const router = useRouter()

// 로그인 성공 시점엔 onAuthStateChanged가 useAuthStore를 갱신한다. 진입 화면으로 넘기되,
// 뒤로가기로 로그인 화면에 돌아오지 않도록 push가 아닌 replace를 쓴다.
function onSuccess() {
  router.replace({ name: 'entry' })
}
</script>

<template>
  <!-- 로그인 — 앱 셸(App.vue)이 max-w-md 가운데 정렬을 제공하므로 여기선 세로 레이아웃만 -->
  <section class="flex min-h-dvh flex-col bg-canvas px-6 pt-8 pb-(--pr-inset-bottom-safe)">
    <header class="mb-8">
      <h1 class="text-heading text-content">로그인</h1>
      <p class="mt-1 text-caption text-content-secondary">다시 만나서 반가워요.</p>
    </header>
    <LoginForm @success="onSuccess" />
    <BaseButton
      variant="ghost"
      size="md"
      class="mt-3 w-full"
      @click="router.push({ name: 'signup' })"
    >
      처음이에요? 회원가입
    </BaseButton>
  </section>
</template>
