/**
 * 운영 화면 공용 상대 시각 표기 — 진행 중 화면이라 절대 시각보다 "얼마나 지났는지"가
 * 중요하다. 공지 카드와 판정 큐가 같은 표기를 쓰도록 한 곳에 둔다.
 */

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatRelativeTime(createdAtMs: number | null, nowMs: number): string {
  // serverTimestamp 반영 전(null)은 방금 보낸 것이다 — 전송 직후 한 틱의 로컬 스냅샷
  if (createdAtMs === null) return '방금'
  const elapsedMs = Math.max(0, nowMs - createdAtMs)
  if (elapsedMs < MINUTE_MS) return '방금'
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}분 전`
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}시간 전`
  return `${Math.floor(elapsedMs / DAY_MS)}일 전`
}
