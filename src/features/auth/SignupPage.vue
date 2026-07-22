<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import SignupForm from './components/SignupForm.vue'
import { useAuthRedirect } from './composables/useAuthRedirect'

const router = useRouter()

// 가드가 보존한 목적지(?redirect=)와 공유 초대 코드(?code=)를 인증 플로우 내내 유지한다.
// 가입 성공 시점엔 Firebase 계정 생성으로 이미 로그인 세션이 만들어져 있으므로
// (onAuthStateChanged가 useAuthStore를 갱신) 바로 복귀시키면 된다.
const { authQuery, redirectAfterAuth } = useAuthRedirect()
</script>

<template>
  <!-- 회원가입 — 앱 셸(App.vue)이 max-w-md 가운데 정렬을 제공하므로 여기선 세로 레이아웃만.
       타이틀·설명 헤더는 앱 셸 공용 헤더(AppHeader)가 route meta로 담당한다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-6 pb-(--pr-inset-bottom-safe)">
    <SignupForm @success="redirectAfterAuth" />
    <BaseButton
      variant="ghost"
      size="md"
      class="mt-3 w-full"
      @click="router.push({ name: 'login', query: authQuery })"
    >
      로그인
    </BaseButton>
  </section>
</template>
