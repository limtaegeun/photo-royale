import { readonly, ref } from 'vue'

/**
 * 실시간 화면의 서버 연결 상태 — 연결 감시(useFirestoreWatchdog)가 쓰고, 앱 셸의 '연결 중' 표시가 읽는다.
 *
 * 연결을 다시 연 뒤 응답이 바로 확인되지 않았거나 점검이 응답 없음을 확인했을 때 true다. 응답이 확인되거나
 * 실시간 화면을 떠나면 false로 돌아간다. 실시간 화면은 한 번에 하나만 떠 있어서 값 하나로 충분하다.
 */
const reconnecting = ref(false)

export function useFirestoreConnectionStatus() {
  function setReconnecting(next: boolean) {
    reconnecting.value = next
  }
  return {
    reconnecting: readonly(reconnecting),
    setReconnecting,
  }
}
