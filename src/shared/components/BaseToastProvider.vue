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
  <ToastProvider swipe-direction="right">
    <BaseToast v-for="item in toasts" :key="item.id" :toast="item" @close="dismiss(item.id)" />
    <ToastViewport
      class="fixed inset-x-0 bottom-0 z-(--pr-z-toast) mx-auto flex w-full max-w-md list-none flex-col gap-2
             px-4 pt-4 pb-[calc(var(--pr-inset-bottom-safe)+1rem)] outline-none"
    />
  </ToastProvider>
</template>
