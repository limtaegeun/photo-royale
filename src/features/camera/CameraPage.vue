<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import { normalizeRoomCode, subscribeToRoom, type RoomInfo } from '@/features/waiting-room'
import { useToast } from '@/shared/composables/useToast'
import { useCameraStream } from './composables/useCameraStream'
import { usePhotoCapture } from './composables/usePhotoCapture'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { status, stream, start } = useCameraStream()
const { photo, failed, capture, clear } = usePhotoCapture()
const videoRef = ref<HTMLVideoElement | null>(null)

/** 콕핏은 방에 매여 있다 — 경로의 코드가 어느 방의 라운드를 뛰는 중인지 가리킨다 */
const roomCode = normalizeRoomCode(String(route.params.roomCode))

/**
 * 방 문서 구독 — 콕핏이 스스로 나갈 시점을 알기 위한 최소한의 연결이다.
 * 호스트가 게임을 종료하면(status가 waiting으로 돌아가거나 round가 사라지면) 플레이어는
 * 뛰는 것을 멈추고 대기실로 돌아가야 하는데, 구독이 없으면 카메라 화면에 갇힌다.
 * (라운드 타이머·공지 수신 UI는 이 구독 위에 후속으로 얹는다)
 */
let unsubscribeRoom: (() => void) | null = null

function leaveCockpit(room: RoomInfo | null) {
  if (room === null) {
    toast({ title: '방을 찾을 수 없어요.', tone: 'danger' })
    router.replace({ name: 'entry' })
    return
  }
  if (room.status !== 'playing' || room.round === null) {
    router.replace({ name: 'waiting-room', params: { roomCode } })
  }
}

watch([stream, videoRef], ([media, video]) => {
  if (!video) return

  video.srcObject = media
  if (media) {
    // jsdom은 play()가 Promise를 반환하지 않으므로 옵셔널 체이닝으로 방어
    video.play()?.catch(() => {})
  }
})

async function shoot() {
  if (!videoRef.value) return
  await capture(videoRef.value)
}

onMounted(() => {
  start()
  unsubscribeRoom = subscribeToRoom(roomCode, leaveCockpit)
})
onUnmounted(() => {
  unsubscribeRoom?.()
  unsubscribeRoom = null
})
</script>

<template>
  <!-- P02 카메라 ON — 브라우저 내 상시 뷰파인더 + 프레임 캡처. HUD/디자인은 후속 작업 -->
  <section class="relative flex min-h-dvh flex-col bg-canvas">
    <video
      v-show="status === 'active'"
      ref="videoRef"
      class="absolute inset-0 h-full w-full object-cover"
      autoplay
      muted
      playsinline
    ></video>

    <!-- 하단 셔터 (스트림 활성 + 미리보기 없음일 때) — 영상 위 HUD라 스크림 필수 -->
    <div
      v-if="status === 'active' && !photo"
      class="absolute inset-x-0 bottom-0 bg-scrim pb-(--pr-inset-bottom-safe)"
    >
      <div class="px-6 pt-4 pb-8">
        <p v-if="failed" class="mb-2 text-center text-caption text-danger">
          촬영에 실패했습니다. 다시 시도해주세요
        </p>
        <BaseButton variant="primary" size="lg" class="w-full" @click="shoot">촬영</BaseButton>
      </div>
    </div>

    <!-- 촬영 결과 미리보기 — 카메라 스트림은 아래에서 계속 유지된다 -->
    <div v-if="photo" class="absolute inset-0 flex flex-col bg-canvas">
      <img :src="photo.url" alt="촬영된 사진" class="min-h-0 flex-1 object-contain" />
      <div class="pb-(--pr-inset-bottom-safe)">
        <div class="px-6 pt-4 pb-8">
          <BaseButton variant="ghost" size="lg" class="w-full" @click="clear">다시 찍기</BaseButton>
        </div>
      </div>
    </div>

    <div
      v-if="status !== 'active'"
      class="relative flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p v-if="status === 'requesting'" class="text-body text-content-secondary">
        카메라 권한을 확인하는 중…
      </p>

      <template v-else-if="status === 'denied'">
        <p class="text-body text-content">카메라 권한이 거부되었습니다</p>
        <p class="text-caption text-content-secondary">
          브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해주세요
        </p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>

      <template v-else-if="status === 'unavailable'">
        <p class="text-body text-content">사용할 수 있는 카메라를 찾지 못했습니다</p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>

      <template v-else>
        <p class="text-body text-content">카메라를 켜지 못했습니다</p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>
    </div>
  </section>
</template>
