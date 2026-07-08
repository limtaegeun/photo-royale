<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { useAuthStore } from '@/features/auth'

const router = useRouter()
const authStore = useAuthStore()

// 닉네임·성별은 가입 시 확정된다. displayName은 가입 시점에 닉네임으로 채워진다(auth/api/signup.ts)
const nickname = computed(() => authStore.user?.displayName ?? '')

// 임시 개발 편의(테스트 계정 전환용) — 로비/프로필 화면이 생기면 그쪽으로 옮긴다
async function onLogout() {
  await authStore.logout()
  router.replace({ name: 'signup' })
}
</script>

<template>
  <!-- P01 입장 — 다크 테마(기본). 콘텐츠 영역 + 하단 고정 CTA의 세로 레이아웃 -->
  <section class="flex min-h-dvh flex-col bg-canvas px-6 pt-6 pb-(--pr-inset-bottom-safe)">
    <div class="flex-1">
      <!-- 헤더 -->
      <header>
        <h1 class="text-heading text-content">포토로얄</h1>
        <p class="mt-1 text-caption text-content-secondary">카메라로 즐기는 실시간 팀 서바이벌</p>
      </header>

      <!-- 히어로 -->
      <div class="mt-8">
        <p class="text-hero text-content">PHOTO<br />ROYALE</p>
        <div class="mt-3 h-1 w-24 rounded-full bg-brand"></div>
        <BaseBadge tone="brand" size="md" class="mt-4">어반 스포츠</BaseBadge>
      </div>

      <!-- 태그라인 -->
      <p class="mt-6 text-body text-content">
        세상은 우리의 경기장.<br />카메라로 포착하고,<br />팀과 함께 생존하세요.
      </p>

      <!-- 로그인 정체성 -->
      <p v-if="nickname" class="mt-8 text-body text-content">
        <span class="font-semibold">{{ nickname }}</span>님, 준비됐나요?
      </p>
    </div>

    <!-- 하단 고정 CTA — 입장 이후 플로우(로비/매칭)가 생기면 연결한다 -->
    <div class="pt-5 pb-6">
      <BaseButton variant="primary" size="md" class="w-full">입장하기</BaseButton>
      <BaseButton variant="ghost" size="md" class="mt-3 w-full" @click="onLogout">
        로그아웃
      </BaseButton>
    </div>
  </section>
</template>
