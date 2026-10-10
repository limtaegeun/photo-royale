import { ref } from 'vue'
import { defineStore } from 'pinia'
import { subscribeToVenueMapImage } from '../api/venueMap'

/**
 * 행사장 지도 보관(P08 §2.2) — 방마다 한 장인 지도를 화면을 옮겨 다녀도 다시 받지 않게 들고 있다.
 * 대기실(useWaitingRoomStore)과 콕핏(CameraPage)은 화면을 떠날 때 자기 구독을 내리지만, 이 구독은
 * 다른 방을 추적할 때까지 남는다. 그래서 참가자가 대기실에서 받아 둔 지도를, 밖에서 신호가 약할 때도
 * 콕핏이 바로 연다. 진행자가 지도를 바꾸면 구독이 새 지도를 받아 온다.
 */
export const useVenueMapStore = defineStore('venueMap', () => {
  /** 지금 추적 중인 방 코드 */
  const roomCode = ref<string | null>(null)
  /** 등록된 지도(JPEG 데이터 URL). 등록 전이거나 아직 받지 못했으면 null */
  const image = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  /**
   * 이 방의 지도를 받기 시작한다. 같은 방의 구독이 살아 있으면 아무것도 하지 않는다 — 대기실 → 콕핏
   * 이동이 지도를 다시 내려받지 않게 하는 지점이다. 구독이 오류로 끊겼으면(권한·한도) 받아 둔 지도는
   * 그대로 두고 다시 구독한다. 다른 방이면 이전 지도를 버린다.
   */
  function track(code: string) {
    if (roomCode.value === code && unsubscribe !== null) return
    if (roomCode.value !== code) {
      stop()
      roomCode.value = code
    }
    unsubscribe = subscribeToVenueMapImage(
      code,
      (nextImage) => {
        image.value = nextImage
      },
      () => {
        unsubscribe = null
      },
    )
  }

  /** 구독을 내리고 받아 둔 지도를 버린다 */
  function stop() {
    unsubscribe?.()
    unsubscribe = null
    roomCode.value = null
    image.value = null
  }

  return { roomCode, image, track, stop }
})
