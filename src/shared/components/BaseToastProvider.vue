<script setup lang="ts">
import { ToastProvider, ToastViewport } from 'reka-ui'
import BaseToast from './BaseToast.vue'
import { useToast } from '@/shared/composables/useToast'

/**
 * 앱 루트에 한 번만 마운트한다(App.vue). 전역 토스트 큐를 구독해 ToastViewport에 렌더한다.
 * 발행은 어느 기능에서든 `useToast().toast(...)`로 한다.
 */
const { toasts, dismiss } = useToast()
</script>

<template>
  <ToastProvider swipe-direction="up">
    <BaseToast v-for="item in toasts" :key="item.id" :toast="item" @close="dismiss(item.id)" />
    <!-- 상단 안전영역 아래에 표시해 화면별 하단 CTA·탭 높이와 무관하게 주요 조작을 가리지 않는다.
         뷰포트는 클릭을 통과시키고 개별 토스트만 pointer-events를 받아, 투명 영역도 조작을 막지 않는다. -->
    <ToastViewport
      class="pointer-events-none fixed inset-x-0 top-0 z-(--pr-z-toast) mx-auto flex w-full max-w-md
             list-none flex-col gap-2 px-4 pt-[calc(var(--pr-inset-top-safe)+1rem)] outline-none"
    />
  </ToastProvider>
</template>
