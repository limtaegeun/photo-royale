import { onScopeDispose, readonly, ref, shallowRef } from 'vue'

export interface CapturedPhoto {
  blob: Blob
  /** 미리보기용 object URL — 다음 캡처·clear 시 자동 revoke */
  url: string
  width: number
  height: number
}

/**
 * 재생 중인 비디오 스트림의 현재 프레임을 브라우저 안에서 사진(JPEG Blob)으로 캡처한다.
 * 네이티브 카메라 앱을 호출하지 않는다.
 */
export function usePhotoCapture() {
  const photo = shallowRef<CapturedPhoto | null>(null)
  const failed = ref(false)

  async function capture(video: HTMLVideoElement): Promise<CapturedPhoto | null> {
    failed.value = false

    const width = video.videoWidth
    const height = video.videoHeight
    // 스트림 메타데이터가 아직 없으면(첫 프레임 전) 캡처 불가
    if (!width || !height) {
      failed.value = true
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      failed.value = true
      return null
    }

    context.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg'))
    if (!blob) {
      failed.value = true
      return null
    }

    clear()
    photo.value = { blob, url: URL.createObjectURL(blob), width, height }
    return photo.value
  }

  function clear() {
    if (photo.value) URL.revokeObjectURL(photo.value.url)
    photo.value = null
  }

  onScopeDispose(clear)

  return { photo, failed: readonly(failed), capture, clear }
}
