import { onScopeDispose, readonly } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStreamStore } from '../stores/useCameraStreamStore'

export type { CameraStreamStatus } from '../stores/useCameraStreamStore'

/**
 * 콕핏이 방 단위 카메라 스트림(useCameraStreamStore)을 빌려 쓴다.
 * 컴포넌트가 해제돼도 끄지 않고 저화질로 쥐어 둔다 — 같은 방의 다음 라운드에서 권한을 다시 묻지 않게.
 */
export function useCameraStream(roomCode: string) {
  const cameraStream = useCameraStreamStore()
  const { status, stream } = storeToRefs(cameraStream)

  function start() {
    return cameraStream.acquire(roomCode)
  }

  onScopeDispose(() => {
    cameraStream.park()
  })

  return { status: readonly(status), stream, start }
}
