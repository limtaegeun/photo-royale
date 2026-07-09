import { onScopeDispose, readonly, ref, shallowRef } from 'vue'

export type CameraStreamStatus =
  | 'idle' // 아직 시작 안 함 (stop 후 포함)
  | 'requesting' // 권한 요청/스트림 여는 중
  | 'active' // 스트림 재생 가능
  | 'denied' // 사용자가 권한 거부
  | 'unavailable' // 카메라 하드웨어 없음 또는 API 미지원
  | 'error' // 그 외 실패 (예: 다른 앱이 카메라 점유)

/**
 * 브라우저를 벗어나지 않고 getUserMedia로 후면 카메라 스트림을 여닫는 상태머신.
 * 컴포넌트 unmount 시 스트림을 자동 해제한다.
 */
export function useCameraStream() {
  const status = ref<CameraStreamStatus>('idle')
  const stream = shallowRef<MediaStream | null>(null)

  let disposed = false

  async function start() {
    if (status.value === 'requesting' || status.value === 'active') return

    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'unavailable'
      return
    }

    status.value = 'requesting'
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })

      // 권한 응답을 기다리는 사이 컴포넌트가 unmount됐으면 즉시 해제
      if (disposed) {
        media.getTracks().forEach((track) => track.stop())
        return
      }

      stream.value = media
      status.value = 'active'
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : ''

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        status.value = 'denied'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status.value = 'unavailable'
      } else {
        status.value = 'error'
      }
    }
  }

  function stop() {
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
    status.value = 'idle'
  }

  onScopeDispose(() => {
    disposed = true
    stop()
  })

  return { status: readonly(status), stream, start, stop }
}
