<script setup lang="ts">
interface Props {
  /** 로그인 상태에서만 우측 프로필 진입 아이콘을 노출한다 */
  showProfileLink?: boolean
}

withDefaults(defineProps<Props>(), {
  showProfileLink: false,
})
</script>

<template>
  <!-- 앱 셸 공용 헤더 — App.vue가 1회 마운트하고, 카메라 콕핏 등 풀스크린 화면은
       route meta.hideAppHeader로 제외한다. 좌측 워드마크는 랜딩으로 돌아가는 홈 링크. -->
  <header
    class="flex h-14 items-center justify-between px-6 pt-(--pr-inset-top-safe) bg-canvas"
  >
    <RouterLink :to="{ name: 'entry' }" class="text-subheading font-bold text-content">
      포토로얄
    </RouterLink>

    <!-- 아이콘 전용 내비게이션 링크 — DS에 IconButton 원자가 아직 없어 RouterLink에 직접
         스타일한다(도입 시 교체). size-12(48px)로 최소 터치 타겟을 충족한다. -->
    <RouterLink
      v-if="showProfileLink"
      :to="{ name: 'profile' }"
      aria-label="프로필 관리"
      class="-mr-3 flex size-12 items-center justify-center rounded-full text-content-secondary
             transition-colors duration-100 ease-standard hover:text-content"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        class="size-6"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
    </RouterLink>
  </header>
</template>
