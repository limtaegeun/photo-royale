<script setup lang="ts"></script>

<template>
  <!-- 앱 셸 — 모바일 뷰포트를 데스크톱에선 가운데 정렬해 폭을 제한 -->
  <div class="flex min-h-dvh justify-center bg-canvas">
    <main class="w-full max-w-md">
      <RouterView />
    </main>
  </div>
</template>
