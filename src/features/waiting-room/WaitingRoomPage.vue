<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import PlayerChip from './components/PlayerChip.vue'
import { useToast } from '@/shared/composables/useToast'
import { normalizeRoomCode } from './api/rooms'
import { useWaitingRoomStore } from './stores/useWaitingRoomStore'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const store = useWaitingRoomStore()
const {
  roomCode,
  phase,
  participants,
  participantCount,
  readyCount,
  isReadyConfirmed,
  isConfirmingReady,
  readyError,
  isHost,
  gameStatus,
} = storeToRefs(store)

// 입장은 멱등이라 새로고침·재방문에도 안전하다. 이탈 시 구독을 해제한다.
onMounted(() => {
  store.enter(normalizeRoomCode(String(route.params.roomCode)))
})
onUnmounted(() => {
  store.leave()
})

// 호스트가 시작하면 status 스냅샷으로 전원이 동시에 게임(카메라 콕핏)으로 넘어간다
watch(gameStatus, (status) => {
  if (status === 'playing') {
    router.replace({ name: 'camera' })
  }
})

/** 초대는 링크 복사 단일 채널 — 링크의 ?code=가 입장 화면의 자동 입장으로 이어진다 */
async function copyInviteLink() {
  if (!roomCode.value) return
  const inviteLink = `${window.location.origin}/?code=${roomCode.value}`
  try {
    await navigator.clipboard.writeText(inviteLink)
    toast({ title: '초대 링크를 복사했어요.', tone: 'success' })
  } catch {
    toast({ title: '복사에 실패했어요. 주소를 직접 공유해 주세요.', tone: 'danger' })
  }
}
</script>

<template>
  <!-- P02 대기실 — 다크 테마(기본). 콘텐츠 영역 + 하단 고정 CTA의 세로 레이아웃.
       호스트/게스트는 같은 화면을 쓰고, 호스트에게만 게임 시작 컨트롤이 추가된다.
       높이는 앱 셸(헤더 아래 남는 공간)을 flex-1로 채운다 — min-h-dvh를 쓰면 헤더 높이만큼
       항상 세로 스크롤이 생긴다. 스크롤은 명단이 실제로 넘칠 때만 생기는 게 정상이다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-6 pb-(--pr-inset-bottom-safe)">
    <div class="flex-1">
      <!-- 헤더 -->
      <header>
        <h1 class="text-title text-content">대기실</h1>
        <p class="mt-1 text-caption text-content-secondary">준비 전 안전 수칙을 확인합니다</p>
      </header>

      <template v-if="phase === 'joined'">
        <!-- 룸 정보 카드 — 초대 수단(링크 복사)을 상시 노출한다.
             코드는 카드 내 주요 정보(text-heading)로, display(카운트다운용)는 과하다 -->
        <div class="mt-6 rounded-lg border border-stroke bg-elevated p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-heading text-content">ROOM {{ roomCode }}</p>
            <BaseBadge tone="info" appearance="outline" size="sm">대기 중</BaseBadge>
          </div>
          <p class="mt-1 text-caption text-content-secondary">
            참가자 {{ participantCount }}명 · 준비 {{ readyCount }}명
          </p>
          <BaseButton variant="ghost" size="md" class="mt-3 w-full" @click="copyInviteLink">
            초대 링크 복사
          </BaseButton>
        </div>

        <!-- 입장 명단 -->
        <div class="mt-6">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-label text-content">입장 명단</h2>
            <p class="text-caption text-content-secondary">
              {{ participantCount }}명 입장 · {{ readyCount }}명 레디
            </p>
          </div>
          <ul v-if="participantCount > 0" class="mt-3 grid grid-cols-3 gap-2">
            <li v-for="participant in participants" :key="participant.id">
              <PlayerChip
                :name="participant.name"
                :team="participant.team"
                :gender="participant.gender"
                :is-ready="participant.isReady"
              />
            </li>
          </ul>
          <p v-else class="mt-3 text-caption text-content-secondary">
            아직 입장한 참가자가 없어요. 초대 링크를 공유해 보세요.
          </p>
        </div>

        <!-- 안전 수칙 카드 — 보조 정보라 라벨+캡션으로 낮춰 CTA·명단에 시선을 양보한다 -->
        <div class="mt-6 rounded-lg border border-stroke bg-elevated p-4">
          <h2 class="text-label text-content">안전 수칙 확인</h2>
          <p class="mt-2 text-caption text-content-secondary">
            무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
          </p>
          <!-- 동의 버튼은 게스트에게만 있으므로 안내문도 게스트에게만 보여준다 -->
          <p v-if="!isHost" class="mt-2 text-caption font-semibold text-warning">
            아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.
          </p>
        </div>
      </template>

      <!-- 입장 실패 — 잘못된 초대 코드 또는 네트워크·권한 문제 -->
      <div
        v-else-if="phase === 'not-found' || phase === 'error'"
        class="mt-6 rounded-lg border border-stroke bg-elevated p-5"
      >
        <h2 class="text-subheading text-content">
          {{ phase === 'not-found' ? '방을 찾을 수 없어요' : '입장에 실패했어요' }}
        </h2>
        <p class="mt-3 text-body text-content-secondary">
          {{
            phase === 'not-found'
              ? '초대 코드가 맞는지 확인하고 다시 시도해 주세요.'
              : '네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.'
          }}
        </p>
        <BaseButton
          variant="primary"
          size="md"
          class="mt-5 w-full"
          @click="router.replace({ name: 'entry' })"
        >
          입장 화면으로
        </BaseButton>
      </div>

      <!-- 참가 등록 중 로딩 -->
      <p v-else class="mt-6 text-body text-content-secondary" role="status">
        대기실에 입장하는 중…
      </p>
    </div>

    <!-- 하단 고정 CTA — 게스트: 안전 수칙 동의 / 호스트(진행자): 팀 배정 시작 -->
    <div v-if="phase === 'joined'" class="pt-5 pb-6">
      <!-- 팀 배정 플로우는 아직 미구현 — 진행자 CTA 자리만 확정해 둔다 -->
      <BaseButton v-if="isHost" variant="accent" size="md" class="w-full">팀 배정 시작</BaseButton>

      <template v-else>
        <p v-if="readyError" class="mb-2 text-caption text-danger" role="alert">
          {{ readyError }}
        </p>
        <BaseButton
          variant="accent"
          size="md"
          class="w-full"
          :disabled="isReadyConfirmed || isConfirmingReady"
          @click="store.confirmReady()"
        >
          {{ isReadyConfirmed ? '준비 완료' : '확인하고 준비 완료' }}
        </BaseButton>
      </template>
    </div>
  </section>
</template>
