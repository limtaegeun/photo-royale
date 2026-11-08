import { KILLSHOT_HEAT_CAP_SEC, KILLSHOT_HEAT_PER_SUBMIT_SEC } from '@/features/round-ops'

/**
 * 킬샷 과열 계산(P20) — 열 문서 한 장과 지금 시각으로 "지금 열이 얼마인가"와 "셔터가 얼마나 더 잠기는가"를 낸다.
 *
 * 경과 시간은 늘 실제보다 짧게 잰다. 그래야 다음 제출에 적는 열이 서버가 계산한 값보다 높아 거부되지 않는다.
 * 대신 셔터가 실제보다 조금(전송 지연만큼) 늦게 풀린다.
 */

/**
 * 서버 보정 시각이 실제 서버보다 앞설 수 있는 폭(ms) — 시계 보정은 2초 미만 차이를 고치지 않는다
 * (waiting-room/serverClock.ts). 서버 시각으로 재는 경과는 이만큼 빼고 쓴다.
 */
export const HEAT_CLOCK_SAFETY_MS = 2000

/** 잠금의 최대 길이(ms) — 1칸이 식는 시간이다. 시계가 틀려도 이보다 길게 잠그지 않는다 */
export const HEAT_LOCK_MAX_MS = KILLSHOT_HEAT_PER_SUBMIT_SEC * 1000

/** 열 계산의 기준점 — 열 문서 한 장과 그 문서를 이 기기가 받은 순간 */
export interface HeatAnchor {
  /** 이 열을 쌓은 라운드 — 지금 라운드와 다르면 열은 0이다 */
  round: number
  /** 마지막 제출 직후의 열(초) */
  heat: number
  /** 마지막 제출이 서버에 닿은 시각(ms). 내 쓰기가 아직 서버에 닿지 않았으면 null */
  lastAtMs: number | null
  /** 이 기기가 문서를 받은 순간의 performance.now() */
  receivedAtMs: number
}

/**
 * 마지막 제출 뒤 흐른 시간(ms) — 두 값 중 큰 쪽을 쓴다. 둘 다 실제보다 길지 않다.
 * - 받은 뒤 흐른 시간: 문서는 서버가 시각을 찍은 뒤에 도착하므로 실제 경과보다 짧다
 * - 서버 보정 시각으로 잰 경과에서 보정 오차(2초)를 뺀 값: 새로고침으로 오래된 문서를 받았을 때 쓴다
 */
export function elapsedSinceLastSubmitMs(
  anchor: HeatAnchor,
  serverNowMs: number,
  perfNowMs: number,
): number {
  const sinceReceived = perfNowMs - anchor.receivedAtMs
  const byServerClock =
    anchor.lastAtMs === null ? 0 : serverNowMs - anchor.lastAtMs - HEAT_CLOCK_SAFETY_MS
  return Math.max(0, sinceReceived, byServerClock)
}

/** 지금 열(초). 문서가 없거나 다른 라운드의 열이면 0 */
export function currentHeat(
  anchor: HeatAnchor | null,
  round: number | null,
  serverNowMs: number,
  perfNowMs: number,
): number {
  if (anchor === null || round === null || anchor.round !== round) return 0
  return Math.max(0, anchor.heat - elapsedSinceLastSubmitMs(anchor, serverNowMs, perfNowMs) / 1000)
}

/** 다음 1칸이 들어갈 자리가 날 때까지 남은 잠금(ms). 0이면 바로 찍을 수 있다 */
export function lockRemainingMs(heat: number): number {
  const overflowSec = heat + KILLSHOT_HEAT_PER_SUBMIT_SEC - KILLSHOT_HEAT_CAP_SEC
  if (overflowSec <= 1e-9) return 0
  return Math.min(HEAT_LOCK_MAX_MS, Math.ceil(overflowSec * 1000))
}

/** 이번 제출로 오른 뒤의 열 — 잠기지 않았을 때만 부른다. rules 상한(12)을 넘지 않게 자른다 */
export function heatAfterSubmit(heat: number): number {
  return Math.min(KILLSHOT_HEAT_CAP_SEC, heat + KILLSHOT_HEAT_PER_SUBMIT_SEC)
}
