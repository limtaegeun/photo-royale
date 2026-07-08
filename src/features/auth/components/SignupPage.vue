<script setup lang="ts">
import { ref } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import SignupForm from './SignupForm.vue'
import type { UserProfile } from '../types'

const profile = ref<UserProfile | null>(null)

function onSuccess(next: UserProfile) {
  profile.value = next
}
</script>

<template>
  <!-- 회원가입 — 앱 셸(App.vue)이 max-w-md 가운데 정렬을 제공하므로 여기선 세로 레이아웃만 -->
  <section class="flex min-h-dvh flex-col bg-canvas px-6 pt-8 pb-(--pr-inset-bottom-safe)">
    <template v-if="profile">
      <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <BaseBadge tone="brand" size="md">가입 완료</BaseBadge>
        <p class="text-heading text-content">
          환영해요,<br /><span class="text-brand">{{ profile.nickname }}</span> 님
        </p>
      </div>
    </template>

    <template v-else>
      <header class="mb-8">
        <h1 class="text-heading text-content">회원가입</h1>
        <p class="mt-1 text-caption text-content-secondary">한 번에 입력하면 바로 시작해요.</p>
      </header>
      <SignupForm @success="onSuccess" />
    </template>
  </section>
</template>
