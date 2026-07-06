<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'

const nickname = ref('')
const gender = ref('')
const genderOptions = [
  { label: '남', value: 'male' },
  { label: '여', value: 'female' },
]
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
        <span
          class="mt-4 inline-flex h-7 items-center rounded-full bg-brand px-3 text-caption font-bold text-on-brand"
        >
          어반 스포츠
        </span>
      </div>

      <!-- 태그라인 -->
      <p class="mt-6 text-body text-content">
        세상은 우리의 경기장.<br />카메라로 포착하고,<br />팀과 함께 생존하세요.
      </p>

      <!-- 폼 -->
      <div class="mt-8 space-y-3">
        <BaseInput v-model="nickname" placeholder="닉네임" />

        <div class="rounded-lg border border-stroke bg-surface p-4">
          <p class="text-caption text-content-secondary">성별</p>
          <BaseSegmented v-model="gender" :options="genderOptions" class="mt-2" />
        </div>
      </div>
    </div>

    <!-- 하단 고정 CTA -->
    <div class="pt-5 pb-6">
      <BaseButton variant="primary" size="md" class="w-full">입장하기</BaseButton>
    </div>
  </section>
</template>
