<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface Props {
  /** 페이지 타이틀 — route meta.appHeaderTitle로 지정한다. 페이지의 h1은 이 헤더가 담당한다 */
  title?: string
  /** 타이틀 아래 한 줄 설명 — route meta.appHeaderDescription으로 지정한다 */
  description?: string
  /** 지정하면 좌측에 이탈 링크를 노출한다 — route meta.appHeaderBackTo로 지정한다 */
  backTo?: RouteLocationRaw
  /** 좌측 이탈 링크의 접근성 라벨 — route meta.appHeaderBackLabel로 지정한다 */
  backLabel?: string
  /** 로그인 상태에서만 우측 프로필 진입 아이콘을 노출한다 */
  showProfileLink?: boolean
}

withDefaults(defineProps<Props>(), {
  title: '포토로얄',
  description: undefined,
  backTo: undefined,
  backLabel: '뒤로',
  showProfileLink: false,
})
</script>

<template>
  <!-- 앱 셸 공용 헤더 — App.vue가 1회 마운트하고, 카메라 콕핏 등 풀스크린 화면은
       route meta.hideAppHeader로 제외한다. 타이틀·설명은 라우트마다 meta로 달라진다.
       상단 여백은 safe-area 인셋 + 12px — pt-(--pr-inset-top-safe) 단독이면 인셋 0인
       환경(데스크톱 브라우저)에서 텍스트가 상단에 붙는다 -->
  <header
    class="flex min-h-14 items-center gap-2 px-6 bg-canvas
           pt-[calc(var(--pr-inset-top-safe)+0.75rem)] pb-3"
  >
    <!-- 좌측 이탈 링크 — 프로필처럼 다른 화면에서 진입만 하는 잎 화면이 갇히지 않도록,
         목적지를 라우트 meta로 선언한 화면에서만 노출한다 -->
    <RouterLink
      v-if="backTo"
      :to="backTo"
      :aria-label="backLabel"
      class="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-full text-content-secondary
             transition-colors duration-100 ease-standard hover:text-content"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-6"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </RouterLink>

    <div class="min-w-0 flex-1">
      <h1 class="text-title text-content">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-caption text-content-secondary">
        {{ description }}
      </p>
    </div>

    <!-- 아이콘 전용 내비게이션 링크 — DS에 IconButton 원자가 아직 없어 RouterLink에 직접
         스타일한다(도입 시 교체). size-12(48px)로 최소 터치 타겟을 충족한다. -->
    <RouterLink
      v-if="showProfileLink"
      :to="{ name: 'profile' }"
      aria-label="프로필 관리"
      class="-mr-3 flex size-12 shrink-0 items-center justify-center rounded-full text-content-secondary
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
