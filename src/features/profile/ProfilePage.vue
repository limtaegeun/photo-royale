<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import { useAuthStore } from '@/features/auth'

const router = useRouter()
const authStore = useAuthStore()

// 닉네임은 가입 시 displayName으로 확정된다(auth/api/signup.ts)
const nickname = computed(() => authStore.user?.displayName ?? '')
const email = computed(() => authStore.user?.email ?? '')

// 이 페이지는 requiresAuth라 로그아웃 후 머물 수 없다 — 공개 랜딩으로 보낸다
async function onLogout() {
  await authStore.logout()
  router.replace({ name: 'entry' })
}
</script>

<template>
  <!-- 프로필 관리 — 계정 정보 확인·로그아웃. 닉네임 변경 등 편집은 추후 확장 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-8 pb-(--pr-inset-bottom-safe)">
    <header class="mb-8">
      <h1 class="text-heading text-content">프로필</h1>
      <p class="mt-1 text-caption text-content-secondary">계정 정보를 관리해요.</p>
    </header>

    <div class="flex-1 space-y-3">
      <div class="rounded-lg border border-stroke bg-surface p-4">
        <p class="text-caption text-content-secondary">닉네임</p>
        <p class="mt-1 text-body text-content">{{ nickname }}</p>
      </div>
      <div class="rounded-lg border border-stroke bg-surface p-4">
        <p class="text-caption text-content-secondary">이메일</p>
        <p class="mt-1 text-body text-content">{{ email }}</p>
      </div>
    </div>

    <div class="pt-5 pb-6">
      <BaseButton variant="ghost" size="md" class="w-full" @click="onLogout">로그아웃</BaseButton>
    </div>
  </section>
</template>
