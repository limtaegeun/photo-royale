<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import { useAuthStore } from '@/features/auth'
import { MyRoomList, ROOM_CODE_LENGTH, normalizeRoomCode } from '@/features/waiting-room'
import { useRoomEntry } from './composables/useRoomEntry'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { isSubmitting, actionError, createAndEnter, joinWithCode } = useRoomEntry()

// 닉네임·성별은 가입 시 확정된다. displayName은 가입 시점에 닉네임으로 채워진다(auth/api/signup.ts)
const nickname = computed(() => authStore.user?.displayName ?? '')

const inviteCodeInput = ref('')

/** 공유 링크(?code=)의 초대 코드 — 로그인 상태면 바로 입장, 비로그인이면 인증 후 돌아와 입장 */
const sharedCode = computed(() => {
  const raw = route.query.code
  return typeof raw === 'string' && raw.trim() !== '' ? normalizeRoomCode(raw) : null
})

/** 비로그인 CTA가 인증 화면으로 들고 가는 쿼리 — 인증 완료 후 이 화면으로 돌아와 자동 입장한다 */
const authQuery = computed(() => (sharedCode.value ? { code: sharedCode.value } : undefined))

// 게스트가 공유 URL로 진입: 인증이 끝난 상태면 확인 없이 바로 대기실로 보낸다
onMounted(() => {
  if (authStore.isLoggedIn && sharedCode.value) {
    router.replace({ name: 'waiting-room', params: { roomCode: sharedCode.value } })
  }
})
</script>

<template>
  <!-- P01 입장 — 다크 테마(기본). 콘텐츠 영역 + 하단 고정 CTA의 세로 레이아웃.
       워드마크는 앱 셸 공용 헤더(AppHeader)가 담당한다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-6 pb-(--pr-inset-bottom-safe)">
    <div class="flex-1">
      <!-- 히어로 -->
      <div class="mt-2">
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

      <!-- 내가 만든 방 — 만든 방이 없으면 컴포넌트가 스스로 숨는다 -->
      <MyRoomList v-if="authStore.isLoggedIn" class="mt-8" />
    </div>

    <!-- 하단 고정 CTA — 로그인 상태면 초대 코드 입장(primary)·방 만들기(secondary),
         비로그인이면 로그인 유도. 코드로 들어오는 게스트가 다수라 입장 경로를 주인공으로 둔다 -->
    <div class="pt-5 pb-6">
      <template v-if="authStore.isLoggedIn">
        <BaseInput
          v-model="inviteCodeInput"
          size="lg"
          class="text-center font-semibold tracking-widest uppercase"
          placeholder="초대 코드를 입력해주세요"
          :maxlength="ROOM_CODE_LENGTH"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          :disabled="isSubmitting"
        />
        <BaseButton
          variant="primary"
          size="md"
          class="mt-3 w-full"
          :disabled="isSubmitting"
          @click="joinWithCode(inviteCodeInput)"
        >
          입장하기
        </BaseButton>
        <p v-if="actionError" class="mt-2 text-caption text-danger" role="alert">
          {{ actionError }}
        </p>

        <div class="mt-5 flex items-center gap-3" aria-hidden="true">
          <span class="flex-1 border-t border-stroke"></span>
          <span class="text-caption text-content-secondary">또는</span>
          <span class="flex-1 border-t border-stroke"></span>
        </div>

        <BaseButton
          variant="ghost"
          size="md"
          class="mt-5 w-full"
          :disabled="isSubmitting"
          @click="createAndEnter"
        >
          새로운 방 만들기
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton
          variant="primary"
          size="md"
          class="w-full"
          @click="router.push({ name: 'login', query: authQuery })"
        >
          로그인
        </BaseButton>
        <BaseButton
          variant="ghost"
          size="md"
          class="mt-3 w-full"
          @click="router.push({ name: 'signup', query: authQuery })"
        >
          계정 만들기
        </BaseButton>
      </template>
    </div>
  </section>
</template>
