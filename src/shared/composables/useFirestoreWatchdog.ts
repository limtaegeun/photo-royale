import { onMounted, onUnmounted } from 'vue'
import { isFirestoreReachable, restartFirestoreNetwork } from '@/shared/api/firestoreConnection'

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

function nextProbeDelay(failures: number): number {
  if (failures === 0) return PROBE_INTERVAL_MS
  return Math.min(PROBE_RETRY_BASE_MS * 2 ** (failures - 1), PROBE_MAX_INTERVAL_MS)
}

/**
 * 실시간 화면(대기실·라운드 운영·콕핏)의 연결 감시 — 폰은 기지국을 옮기거나 화면이 잠기면 연결이 끊김 신호 없이
 * 죽는다. 그동안 공지와 게임 종료가 오지 않고, SDK가 스스로 알아챌 때까지 40초 가까이 걸린다.
 * 화면이 돌아올 때 바로 새로 열고, 보이는 동안에는 주기적으로 응답을 확인해 멎었으면 새로 연다.
 */
export function useFirestoreWatchdog(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let hiddenAtMs: number | null = null
  let failures = 0
  let stopped = false

  function schedule(delayMs: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(check, delayMs)
  }

  async function check() {
    if (document.visibilityState !== 'visible') return
    const reachable = await isFirestoreReachable(PROBE_TIMEOUT_MS)
    if (stopped) return
    if (reachable) {
      failures = 0
    } else {
      failures += 1
      await restartFirestoreNetwork().catch(() => {})
      if (stopped) return
    }
    schedule(nextProbeDelay(failures))
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      hiddenAtMs = Date.now()
      if (timer !== null) clearTimeout(timer)
      timer = null
      return
    }
    const hiddenForMs = hiddenAtMs === null ? 0 : Date.now() - hiddenAtMs
    hiddenAtMs = null
    if (hiddenForMs >= RESUME_RESTART_MIN_HIDDEN_MS) void restartFirestoreNetwork().catch(() => {})
    failures = 0
    schedule(PROBE_INTERVAL_MS)
  }

  /** 뒤로 가기 캐시에서 되살아난 페이지 — visibilitychange 없이 돌아오는 경로가 있다 */
  function handlePageShow(event: PageTransitionEvent) {
    if (!event.persisted) return
    void restartFirestoreNetwork().catch(() => {})
    failures = 0
    schedule(PROBE_INTERVAL_MS)
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    schedule(PROBE_INTERVAL_MS)
  })

  onUnmounted(() => {
    stopped = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pageshow', handlePageShow)
    if (timer !== null) clearTimeout(timer)
    timer = null
  })
}
