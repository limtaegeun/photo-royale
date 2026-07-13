<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { useCameraStream } from './composables/useCameraStream'
import { usePhotoCapture } from './composables/usePhotoCapture'

const { status, stream, start } = useCameraStream()
const { photo, failed, capture, clear } = usePhotoCapture()
const videoRef = ref<HTMLVideoElement | null>(null)

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

onMounted(start)
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
