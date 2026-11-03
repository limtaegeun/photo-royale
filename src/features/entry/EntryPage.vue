<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import { useAuthStore } from '@/features/auth'
import { MyRoomList, ROOM_CODE_LENGTH, normalizeRoomCode } from '@/features/waiting-room'
import { useRoomEntry } from './composables/useRoomEntry'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { pendingAction, isSubmitting, actionError, createAndEnter, joinWithCode } = useRoomEntry()

// 닉네임·성별은 가입 시 확정된다. displayName은 가입 시점에 닉네임으로 채워진다(auth/api/signup.ts)
const nickname = computed(() => authStore.user?.displayName ?? '')

const inviteCodeInput = ref('')

/**
 * 입력 중에도 공백을 빼고 전각을 반각으로 바꾼다 — 칸 길이가 코드 길이(4)라, 공백 한 칸이 자리를 먹으면
 * 마지막 글자를 칠 수 없었다(11/01 QA 탐색 EX-04). 대문자화는 제출 시 정규화와 화면 uppercase 가 맡는다.
 */
async function onInviteCodeInput(value: string | undefined) {
  const raw = value ?? ''
  const cleaned = raw.normalize('NFKC').replace(/\s+/g, '')
  // 친 값을 먼저 받고 다음 틱에 정리한다 — 정리한 값이 직전 값과 같으면(공백만 친 경우) 바인딩이 바뀌지 않아
  // 입력칸에 공백이 그대로 남기 때문이다
  inviteCodeInput.value = raw
  if (cleaned === raw) return
  await nextTick()
  inviteCodeInput.value = cleaned
}

/** 공유 링크(?code=)의 초대 코드 — 로그인 상태면 바로 입장, 비로그인이면 인증 후 돌아와 입장 */
const sharedCode = computed(() => {
  const raw = route.query.code
  return typeof raw === 'string' && raw.trim() !== '' ? normalizeRoomCode(raw) : null
})

/** 비로그인 CTA가 인증 화면으로 들고 가는 쿼리 — 인증 완료 후 이 화면으로 돌아와 자동 입장한다 */
const authQuery = computed(() => (sharedCode.value ? { code: sharedCode.value } : undefined))

/**
 * 비로그인 CTA 순서 — 첫 번째가 primary 다. 공유 링크로 온 사람은 대부분 처음 오는 게스트라
 * 계정 만들기를 앞에 두고, 코드 없이 온 사람은 세션이 끊긴 기존 사용자가 많아 로그인을 앞에 둔다
 */
const guestCtas = computed(() => {
  const login = { routeName: 'login', label: '로그인' } as const
  const signup = { routeName: 'signup', label: '계정 만들기' } as const
  return sharedCode.value ? [signup, login] : [login, signup]
})

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
         비로그인이면 로그인 유도(공유 링크로 왔으면 초대 안내 + 계정 만들기 우선).
         코드로 들어오는 게스트가 다수라 입장 경로를 주인공으로 둔다 -->
    <div class="pt-5 pb-6">
      <template v-if="authStore.isLoggedIn">
        <!-- 폼으로 묶어 모바일 키보드의 '이동'(Enter)도 입장하기와 같게 제출한다 — 버튼 클릭만 받으면
             Enter 가 아무 반응도 없고 틀린 코드 안내도 안 떴다(11/01 QA 탐색 EX-02) -->
        <form class="flex flex-col gap-3" @submit.prevent="joinWithCode(inviteCodeInput)">
          <BaseInput
            :model-value="inviteCodeInput"
            @update:model-value="onInviteCodeInput"
            size="lg"
            class="text-center font-semibold tracking-widest uppercase"
            placeholder="초대 코드를 입력해주세요"
            :maxlength="ROOM_CODE_LENGTH"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="go"
            :disabled="isSubmitting"
          />
          <BaseButton
            type="submit"
            variant="primary"
            size="md"
            class="w-full"
            :loading="pendingAction === 'join'"
            :disabled="pendingAction === 'create'"
          >
            입장하기
          </BaseButton>
        </form>
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
          :loading="pendingAction === 'create'"
          :disabled="pendingAction === 'join'"
          @click="createAndEnter"
        >
          새로운 방 만들기
        </BaseButton>
      </template>
      <div v-else class="flex flex-col gap-5">
        <!-- 공유 링크로 온 비로그인 게스트 — 어느 방에 초대받았는지와, 인증하면 그 방으로 바로
             들어간다는 것을 CTA 바로 위에서 알린다 -->
        <BaseCard v-if="sharedCode" role="status">
          <!-- 코드는 주소창 값 그대로라 길이 제한이 없다 — 긴 값이 카드·화면 밖으로 넘치지 않게 글자 단위로 끊는다 -->
          <h2 class="text-label break-keep text-content">
            <span class="font-semibold tracking-widest break-all">{{ sharedCode }}</span> 방에
            초대받았어요
          </h2>
          <p class="mt-2 text-caption break-keep text-content-secondary">
            로그인하거나 계정을 만들면 바로 입장해요.
          </p>
        </BaseCard>
        <div class="flex flex-col gap-3">
          <BaseButton
            v-for="(cta, index) in guestCtas"
            :key="cta.routeName"
            :variant="index === 0 ? 'primary' : 'ghost'"
            size="md"
            class="w-full"
            @click="router.push({ name: cta.routeName, query: authQuery })"
          >
            {{ cta.label }}
          </BaseButton>
        </div>
      </div>
    </div>
  </section>
</template>
