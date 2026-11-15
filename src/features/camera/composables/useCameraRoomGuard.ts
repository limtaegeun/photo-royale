import type { NavigationFailure, RouteLocationNormalized } from 'vue-router'
import { normalizeRoomCode } from '@/features/waiting-room'
import { useCameraStreamStore } from '../stores/useCameraStreamStore'

/**
 * 라우트 후처리: 카메라를 쥔 방을 벗어나면 카메라를 끈다.
 * 콕핏 ↔ 대기실 ↔ 라운드 기록처럼 같은 방 코드를 가진 화면 사이에서는 그대로 쥐고 있는다.
 * 같은 방이라도 meta.releaseCamera 가 붙은 화면(게임이 끝난 마무리 페이지)으로 가면 끈다.
 */
export function releaseCameraOutsideRoom(
  to: RouteLocationNormalized,
  _from?: RouteLocationNormalized,
  failure?: NavigationFailure | void,
) {
  // 막히거나 취소된 이동은 화면이 그대로다
  if (failure) return
  const cameraStream = useCameraStreamStore()
  if (cameraStream.roomCode === null) return

  const target = to.params.roomCode
  // 같은 방이어도 게임이 끝난 화면(마무리 페이지 등 meta.releaseCamera)이면 놓는다
  const keepsRoom = typeof target === 'string' && normalizeRoomCode(target) === cameraStream.roomCode
  if (keepsRoom && !to.meta.releaseCamera) return
  cameraStream.release()
}
