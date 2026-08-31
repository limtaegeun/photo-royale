/**
 * 서버 시각 보정 — 라운드가 끝났는지를 **기기 시계가 아니라 서버 시계 기준으로** 판정하기 위한
 * 오프셋을 관리한다.
 *
 * 왜 필요한가: 남은 시간은 `durationMs - (now - startedAt)`로만 정의되는데, 여기서 `now`가
 * 기기 시계였다. 자동 시각 동기화가 꺼진 기기가 몇 분 앞서 있으면 그 기기만 라운드를 일찍
 * 끝난 것으로 보고, 대기실도 같은 시계로 복귀를 판정하므로 **혼자 게임에서 빠진 채 돌아오지도
 * 못한다**(QA M-07 실측).
 *
 * 어디서 재는가: 방 문서의 `round.startedAt`이다. 이 값은 호스트의 모든 라운드 전이(시작·정지·
 * 재개·시간 조정)에서 `serverTimestamp()`로 새로 찍히므로(round.ts의 writeRound), 그 값이
 * **바뀐 스냅샷을 받은 순간**의 기기 시각과 비교하면 두 시계의 차가 나온다.
 *
 * 두 가지를 걸러야 값이 오염되지 않는다.
 *
 * 1. **구독의 첫 스냅샷은 샘플이 아니다.** 이미 진행 중인 라운드에 합류하면 그 startedAt이 한참
 *    과거라, 그대로 쓰면 기기가 몇 분 빠른 것처럼 오판한다. 반대로 **구독 중에 값이 바뀌는 것**
 *    (라운드가 없다가 시작되는 것 포함)은 서버가 방금 찍었다는 뜻이라 가장 좋은 샘플이다 —
 *    '라운드 없음'도 관측 이력으로 세어, 대기실에서 시작을 함께 본 기기가 보정을 얻게 한다.
 *    이 판정은 반드시 **구독 단위**여야 한다. 방을 갈아타 새 구독이 열리면 그 첫 스냅샷도 언제
 *    찍힌 앵커인지 알 수 없으므로, 관측 이력은 구독마다 새로 시작한다(createRoundAnchorObserver).
 * 2. **늦게 도착한 스냅샷은 오프셋을 실제보다 작게 만든다.** 측정값은 항상
 *    `참값 - 전송지연`이라 지연이 클수록 작아진다(오프라인에서 몇 분 뒤 복구되면 크게 작아진다).
 *    그래서 샘플 중 **가장 큰 값**을 채택한다 — 가장 지연이 적었던 관측이 참값에 제일 가깝다.
 *
 * 한 번도 재지 못했으면 보정 없이(0) 동작한다 — 기존 동작 그대로라 나빠지지 않는다.
 * 저장은 sessionStorage best-effort다(새로고침 유지, 접근이 막힌 환경에서는 조용히 포기한다).
 */

const OFFSET_STORAGE_KEY = 'pr:server-clock-offset'

/** 측정된 기기↔서버 시계 차(ms). null이면 아직 한 번도 재지 못했다는 뜻이다 */
let offsetMs: number | null = null
let restored = false

function restoreOnce(): void {
  if (restored) return
  restored = true
  try {
    const saved = sessionStorage.getItem(OFFSET_STORAGE_KEY)
    if (saved === null) return
    const parsed = Number(saved)
    if (Number.isFinite(parsed)) offsetMs = parsed
  } catch {
    // sessionStorage 접근이 막힌 환경 — 보정 없이 진행한다
  }
}

function persist(value: number): void {
  try {
    sessionStorage.setItem(OFFSET_STORAGE_KEY, String(value))
  } catch {
    // 저장 실패는 이번 세션 안에서만 손해다(메모리 값은 그대로 쓴다)
  }
}

/**
 * 방 스냅샷의 라운드 앵커를 관측한다.
 *
 * @param startedAtMs 스냅샷의 `round.startedAtMs`. 라운드 없음·serverTimestamp 미반영이면 null
 * @param fromCache 로컬 캐시에서 나온 스냅샷인지(서버가 방금 확인해 준 것이 아니면 샘플로 쓰지 않는다)
 * @param receivedAtMs 스냅샷을 받은 기기 시각(테스트에서 주입)
 */
export type RoundAnchorObserver = (
  startedAtMs: number | null,
  fromCache: boolean,
  receivedAtMs?: number,
) => void

/**
 * 구독 하나가 쓸 앵커 관측자를 만든다 — 방 문서를 구독하는 모든 화면이 같은 경로
 * (subscribeToRoom)로 지나므로, 거기서 구독마다 하나씩 만들면 오프셋이 저절로 채워진다.
 *
 * 관측 이력(첫 스냅샷인지·직전 앵커가 무엇이었는지)은 구독마다 새로 시작해야 한다. 방을 갈아타
 * 새 구독이 열렸는데 이전 구독의 이력을 이어 쓰면, 진행 중이던 라운드의 과거 앵커가 '구독 중의
 * 변화'로 보여 샘플이 된다. 반면 측정된 오프셋은 구독이 아니라 **기기의 성질**이라 밖(모듈)에 둔다.
 */
export function createRoundAnchorObserver(): RoundAnchorObserver {
  /** 직전 스냅샷의 앵커. 값이 "바뀌는" 순간만 샘플로 인정하기 위해 들고 있는다 */
  let lastAnchorMs: number | null = null
  /** 이 구독에서 스냅샷을 한 번이라도 받았는가 — 첫 관측과 '구독 중 변화'를 가르는 기준 */
  let seenSnapshot = false

  return function observeRoundAnchor(startedAtMs, fromCache, receivedAtMs = Date.now()) {
    restoreOnce()
    const hadPreviousSnapshot = seenSnapshot
    const previousAnchorMs = lastAnchorMs
    seenSnapshot = true
    lastAnchorMs = startedAtMs

    // 라운드가 없거나 serverTimestamp가 아직 반영되지 않은 스냅샷 — 잴 것이 없다.
    // 다만 '받았다'는 사실은 위에서 남겼다: 다음에 앵커가 생기면 그것이 구독 중의 변화가 된다
    if (startedAtMs === null) return
    // 구독의 첫 스냅샷은 언제 찍힌 앵커인지 알 수 없다(진행 중 라운드에 합류했을 수 있다)
    if (!hadPreviousSnapshot) return
    // 값이 그대로면 재전송·재구독일 뿐 새 관측이 아니다
    if (previousAnchorMs === startedAtMs) return
    // 캐시에서 나온 값은 서버가 방금 확인해 준 것이 아니다
    if (fromCache) return

    const sample = startedAtMs - receivedAtMs
    if (offsetMs === null || sample > offsetMs) {
      offsetMs = sample
      persist(sample)
    }
  }
}

/** 서버 기준 현재 시각(ms). 보정을 못 쟀으면 기기 시각을 그대로 돌려준다 */
export function serverNow(): number {
  restoreOnce()
  return Date.now() + (offsetMs ?? 0)
}

/** 측정된 보정값(ms). 아직 못 쟀으면 null — 화면이 "보정 여부"를 구분해야 할 때 쓴다 */
export function serverClockOffsetMs(): number | null {
  restoreOnce()
  return offsetMs
}

/** 테스트 격리용 — 측정 상태를 초기화한다(구독별 관측 이력은 관측자마다 새로 만들면 된다) */
export function resetServerClock(): void {
  offsetMs = null
  restored = false
  try {
    sessionStorage.removeItem(OFFSET_STORAGE_KEY)
  } catch {
    // 지우지 못해도 메모리 상태는 초기화됐다
  }
}
