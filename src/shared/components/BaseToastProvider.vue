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
    <!-- 하단 고정 바(대기실 CTA·라운드 운영 탭 = 둘 다 96px) 위로 토스트를 띄우려면 두 가지가
         모두 필요하다(QA C-05·H-04에서 하나씩 빠뜨려 두 번 실패했다):
         ① pb 6rem — 토스트가 고정 바를 시각적으로 가리지 않게 밀어 올린다.
         ② pointer-events-none — 뷰포트는 화면 하단을 덮는 투명 컨테이너라, 겹쳐 보이지 않아도
            히트 테스트가 여기에 잡혀 그 4초 동안 고정 바 클릭이 먹지 않는다.
         클릭은 개별 토스트(BaseToast)가 pointer-events-auto로 다시 켜서 받는다. -->
    <ToastViewport
      class="pointer-events-none fixed inset-x-0 bottom-0 z-(--pr-z-toast) mx-auto flex w-full max-w-md
             list-none flex-col gap-2 px-4 pt-4 pb-[calc(var(--pr-inset-bottom-safe)+6rem)] outline-none"
    />
  </ToastProvider>
</template>
