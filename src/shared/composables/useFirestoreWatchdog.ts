import { onMounted, onUnmounted } from 'vue'
import { isFirestoreReachable, restartFirestoreNetwork, watchFirestoreSynced } from '@/shared/api/firestoreConnection'
import { useFirestoreConnectionStatus } from './useFirestoreConnectionStatus'

/** 점검 간격(ms) — 서버 응답이 멎은 뒤 알아채기까지의 최대 시간은 이 값 + 응답 대기다. 점검마다 문서 읽기 1회가 든다 */
export const PROBE_INTERVAL_MS = 15_000
/** 응답 대기(ms) — 킬샷 사진처럼 큰 문서가 내려오는 중이면 이 시간을 넘길 수 있다 */
export const PROBE_TIMEOUT_MS = 6_000
/** 새로 연 뒤 다시 확인할 때까지의 첫 간격(ms) — 새 연결도 죽어 있으면 빨리 알아채야 한다 */
export const PROBE_RETRY_BASE_MS = 5_000
/**
 * 실패가 이어질 때의 최대 간격(ms) — 실패마다 간격을 두 배로 늘린다. 큰 문서가 내려오는 중인 느린 폰은 점검이
 * 실패해 연결을 새로 열면 그 문서를 처음부터 다시 받으므로, 끝까지 받을 시간을 줘야 한다.
 */
export const PROBE_MAX_INTERVAL_MS = 30_000
/** 이만큼 넘게 가려져 있다 돌아오면 연결부터 새로 연다(ms) — 화면 잠금·앱 전환 뒤의 연결은 죽어 있기 쉽다 */
export const RESUME_RESTART_MIN_HIDDEN_MS = 3_000
/**
 * 돌아와서 새로 연 뒤 첫 확인까지(ms) — 새로 연 연결도 죽어 있을 수 있다. Safari 엔진은 앱이 연결을 새로 열어도
 * 죽은 소켓을 다시 쓰는데, 평소 간격(15초 + 응답 대기 6초)을 기다리면 공지가 13~22초 늦었다(2026-11-06 실측).
 */
export const RESUME_PROBE_DELAY_MS = 1_000
/** 돌아온 직후 확인의 응답 대기(ms) — 살아 있는 연결은 수백 ms 안에 답한다 */
export const RESUME_PROBE_TIMEOUT_MS = 3_000
/**
 * 돌아온 직후 빠른 확인 횟수 — 다 실패하면 평소처럼 5·10·20·30초 간격으로 돌아간다. 큰 문서를 받는 느린 폰이
 * 짧은 응답 대기에 걸려 연결을 거듭 새로 열지 않게 횟수를 묶는다.
 */
export const RESUME_FAST_PROBES = 3
/** 새로 연 뒤 이만큼 지나도 응답이 확인되지 않으면 '연결 중'을 띄운다(ms) — 바로 살아나는 복귀에서는 깜빡이지 않는다 */
export const RECONNECTING_NOTICE_DELAY_MS = 1_500
/** 한 번의 복귀에 화면 복귀·포커스·온라인 신호가 겹쳐 와도 연결은 한 번만 새로 연다(ms) */
export const RESUME_DEDUPE_MS = 2_000

/** 다음 점검까지(ms) — 응답이 확인된 뒤로 연달아 새로 연 횟수에 따라 15초, 실패 뒤엔 5·10·20·30초 */
function nextProbeDelay(restarts: number): number {
  if (restarts === 0) return PROBE_INTERVAL_MS
  return Math.min(PROBE_RETRY_BASE_MS * 2 ** (restarts - 1), PROBE_MAX_INTERVAL_MS)
}

/**
 * 실시간 화면(대기실·라운드 운영·콕핏)의 연결 감시 — 폰은 기지국을 옮기거나 화면이 잠기면 연결이 끊김 신호 없이
 * 죽는다. 그동안 공지와 게임 종료가 오지 않고, SDK가 스스로 알아챌 때까지 40초 가까이 걸린다.
 * 브라우저로 돌아오는 신호(화면 복귀·포커스·온라인·뒤로 가기 캐시)를 받으면 바로 새로 열고 짧은 간격으로 응답을
 * 확인한다. 보이는 동안에는 주기적으로 응답을 확인해 멎었으면 새로 연다. 응답이 확인될 때까지는 '연결 중'을 알린다.
 */
export function useFirestoreWatchdog(): void {
  const { setReconnecting } = useFirestoreConnectionStatus()
  let timer: ReturnType<typeof setTimeout> | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  let hiddenAtMs: number | null = null
  let blurredAtMs: number | null = null
  let lastResumeAtMs: number | null = null
  /** 응답이 확인된 뒤로 연달아 새로 연 횟수 */
  let restarts = 0
  let fastProbesLeft = 0
  let stopped = false
  let stopWatchingSynced: (() => void) | null = null

  function schedule(delayMs: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(check, delayMs)
  }

  function clearNoticeTimer() {
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = null
  }

  function showReconnectingLater() {
    if (noticeTimer !== null) return
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      setReconnecting(true)
    }, RECONNECTING_NOTICE_DELAY_MS)
  }

  async function check() {
    if (document.visibilityState !== 'visible') return
    const fast = fastProbesLeft > 0
    if (fast) fastProbesLeft -= 1
    const reachable = await isFirestoreReachable(fast ? RESUME_PROBE_TIMEOUT_MS : PROBE_TIMEOUT_MS)
    if (stopped) return
    if (reachable) {
      markSynced()
      return
    }
    clearNoticeTimer()
    setReconnecting(true)
    await restart()
    if (stopped) return
    // 빠른 확인을 다 썼으면 평소 재시도 간격의 첫 칸(5초)부터 다시 늘린다
    if (fast && fastProbesLeft === 0) restarts = 1
    schedule(fastProbesLeft > 0 ? RESUME_PROBE_DELAY_MS : nextProbeDelay(restarts))
  }

  async function restart() {
    restarts += 1
    await restartFirestoreNetwork().catch(() => {})
  }

  /**
   * 서버가 응답했다 — '연결 중'을 내리고 평소 간격으로 돌아간다. 점검 응답과 구독 스냅샷 둘 다 이리 온다.
   * 응답이 없는 동안의 점검을 3초마다 보내 '연결 중'을 빨리 내려 봤더니, 죽은 연결에 요청이 쌓여 WebKit 이
   * 그 연결을 늦게 버리는 경우가 있었다(게임 종료 반영 175초, 2026-11-08 실측). 그래서 점검은 늘리지 않고 구독으로 안다.
   */
  function markSynced() {
    restarts = 0
    fastProbesLeft = 0
    clearNoticeTimer()
    setReconnecting(false)
    schedule(PROBE_INTERVAL_MS)
  }

  function handleSynced() {
    if (stopped || document.visibilityState !== 'visible') return
    // 평소(응답이 확인된 상태)의 스냅샷은 점검 주기를 건드리지 않는다
    if (restarts > 0 || fastProbesLeft > 0) markSynced()
  }

  /** 브라우저로 돌아왔다 — 연결부터 새로 열고 짧은 간격으로 응답을 확인한다 */
  function reconnectNow() {
    const now = Date.now()
    if (lastResumeAtMs !== null && now - lastResumeAtMs < RESUME_DEDUPE_MS) return
    lastResumeAtMs = now
    restarts = 0
    void restart()
    fastProbesLeft = RESUME_FAST_PROBES
    showReconnectingLater()
    schedule(RESUME_PROBE_DELAY_MS)
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      hiddenAtMs = Date.now()
      if (timer !== null) clearTimeout(timer)
      timer = null
      clearNoticeTimer()
      return
    }
    const hiddenForMs = hiddenAtMs === null ? 0 : Date.now() - hiddenAtMs
    hiddenAtMs = null
    if (hiddenForMs >= RESUME_RESTART_MIN_HIDDEN_MS) {
      reconnectNow()
      return
    }
    // 빠른 확인 중이거나 응답이 없던 중에 잠깐 가려졌다면 하던 확인을 잇는다
    if (fastProbesLeft > 0) {
      showReconnectingLater()
      schedule(RESUME_PROBE_DELAY_MS)
      return
    }
    schedule(nextProbeDelay(restarts))
  }

  /** 뒤로 가기 캐시에서 되살아난 페이지 — visibilitychange 없이 돌아오는 경로가 있다 */
  function handlePageShow(event: PageTransitionEvent) {
    if (!event.persisted) return
    reconnectNow()
  }

  /** 앱 전환 — 인앱 브라우저처럼 화면이 가려졌다는 신호 없이 포커스만 오가는 환경이 있다 */
  function handleBlur() {
    blurredAtMs = Date.now()
  }

  function handleFocus() {
    const blurredForMs = blurredAtMs === null ? 0 : Date.now() - blurredAtMs
    blurredAtMs = null
    if (document.visibilityState !== 'visible') return
    if (blurredForMs >= RESUME_RESTART_MIN_HIDDEN_MS) reconnectNow()
  }

  /** 네트워크가 끊겼다 돌아왔다(비행기 모드 해제·음영 탈출) — 남아 있는 연결은 죽은 망의 것이다 */
  function handleOnline() {
    if (document.visibilityState !== 'visible') return
    reconnectNow()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    stopWatchingSynced = watchFirestoreSynced(handleSynced)
    schedule(PROBE_INTERVAL_MS)
  })

  onUnmounted(() => {
    stopped = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pageshow', handlePageShow)
    window.removeEventListener('blur', handleBlur)
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('online', handleOnline)
    stopWatchingSynced?.()
    stopWatchingSynced = null
    if (timer !== null) clearTimeout(timer)
    timer = null
    clearNoticeTimer()
    setReconnecting(false)
  })
}
