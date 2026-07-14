<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import SignupForm from './SignupForm.vue'

const router = useRouter()

// 가입 성공 시점엔 Firebase 계정 생성으로 이미 로그인 세션이 만들어져 있다
// (onAuthStateChanged가 useAuthStore를 갱신). 진입 화면으로 넘기되, 뒤로가기로
// 가입 화면에 돌아오지 않도록 push가 아닌 replace를 쓴다.
function onSuccess() {
  router.replace({ name: 'entry' })
}
</script>

<template>
  <!-- 회원가입 — 앱 셸(App.vue)이 max-w-md 가운데 정렬을 제공하므로 여기선 세로 레이아웃만 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-8 pb-(--pr-inset-bottom-safe)">
    <header class="mb-8">
      <h1 class="text-heading text-content">회원가입</h1>
      <p class="mt-1 text-caption text-content-secondary">한 번에 입력하면 바로 시작해요.</p>
    </header>
    <SignupForm @success="onSuccess" />
    <BaseButton
      variant="ghost"
      size="md"
      class="mt-3 w-full"
      @click="router.push({ name: 'login' })"
    >
      이미 계정이 있어요? 로그인
    </BaseButton>
  </section>
</template>
