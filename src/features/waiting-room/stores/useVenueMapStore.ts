import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchVenueMap, fetchVenueMapVersion } from '../api/venueMap'

/** 지도가 바뀌었는지 확인하는 간격(ms) — 확인마다 문서 읽기 1회가 든다 */
export const VENUE_MAP_CHECK_INTERVAL_MS = 60_000
/** 아직 한 번도 받지 못했을 때의 재시도 간격(ms) — 신호가 좋을 때 받아 둬야 콕핏에서 연다 */
export const VENUE_MAP_RETRY_INTERVAL_MS = 15_000

/**
 * 행사장 지도 보관(P08 §2.2) — 방마다 한 장인 지도를 화면을 옮겨 다녀도 다시 받지 않게 들고 있다.
 * 대기실(useWaitingRoomStore)과 콕핏(CameraPage)은 화면을 떠날 때 자기 구독을 내리지만, 이 추적은
 * 다른 방을 추적할 때까지 남는다. 그래서 참가자가 대기실에서 받아 둔 지도를, 밖에서 신호가 약할 때도
 * 콕핏이 바로 연다.
 *
 * 실시간 구독이 아니라 판(갱신 시각)을 주기적으로 확인해 바뀌었을 때만 내려받는다(P16 §8). 약 1MB인 지도를
 * 구독으로 받으면 그동안 공지와 게임 종료가 뒤에 서기 때문이다. 진행자가 지도를 바꾸면 참가자는 1분 안에,
 * 또는 지도를 열거나 화면으로 돌아올 때 새 지도를 받는다.
 */
export const useVenueMapStore = defineStore('venueMap', () => {
  /** 지금 추적 중인 방 코드 */
  const roomCode = ref<string | null>(null)
  /** 등록된 지도(JPEG 데이터 URL). 등록 전이거나 아직 받지 못했으면 null */
  const image = ref<string | null>(null)

  /** 들고 있는 지도의 판. undefined면 아직 한 번도 확인하지 못했고, null이면 등록 전이다 */
  let version: string | null | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  let isChecking = false
  let isListeningVisibility = false

  /** 판을 확인하고 바뀌었으면 내려받는다. 실패하면 받아 둔 지도를 그대로 두고 다음 확인에 맡긴다 */
  async function refresh() {
    const code = roomCode.value
    if (code === null || isChecking) return
    isChecking = true
    try {
      const latestVersion = await fetchVenueMapVersion(code)
      if (roomCode.value !== code || latestVersion === version) return
      const map = latestVersion === null ? null : await fetchVenueMap(code)
      if (roomCode.value !== code) return
      image.value = map?.image ?? null
      version = map === null ? null : map.version
    } catch {
      // 신호가 약하거나 아직 볼 권한이 없다 — 지도는 게임의 보조 정보라 화면을 막지 않는다
    } finally {
      isChecking = false
    }
  }

  function scheduleNextCheck() {
    if (timer !== null) clearTimeout(timer)
    const delay = version === undefined ? VENUE_MAP_RETRY_INTERVAL_MS : VENUE_MAP_CHECK_INTERVAL_MS
    timer = setTimeout(async () => {
      if (document.visibilityState === 'visible') await refresh()
      if (roomCode.value !== null) scheduleNextCheck()
    }, delay)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void refresh()
  }

  /**
   * 이 방의 지도를 받기 시작한다. 같은 방을 이미 추적 중이면 아무것도 하지 않는다 — 대기실 → 콕핏
   * 이동이 지도를 다시 내려받지 않게 하는 지점이다. 다른 방이면 이전 지도를 버린다.
   */
  function track(code: string) {
    if (roomCode.value === code) return
    stop()
    roomCode.value = code
    if (!isListeningVisibility) {
      document.addEventListener('visibilitychange', handleVisibilityChange)
      isListeningVisibility = true
    }
    void refresh().finally(() => {
      if (roomCode.value === code) scheduleNextCheck()
    })
  }

  /**
   * 호스트가 방금 저장한 지도를 바로 쓴다 — 자기가 올린 지도를 다시 내려받지 않도록 판만 확인해 둔다.
   * 판을 못 읽으면 다음 확인에서 한 번 더 받을 뿐이다.
   */
  async function adoptSaved(savedImage: string) {
    const code = roomCode.value
    image.value = savedImage
    version = undefined
    if (code === null) return
    const latestVersion = await fetchVenueMapVersion(code).catch(() => undefined)
    if (roomCode.value === code) version = latestVersion
  }

  /** 추적을 멈추고 받아 둔 지도를 버린다 */
  function stop() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (isListeningVisibility) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      isListeningVisibility = false
    }
    roomCode.value = null
    image.value = null
    version = undefined
  }

  return { roomCode, image, track, refresh, adoptSaved, stop }
})
