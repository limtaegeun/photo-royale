/**
 * 시각 표기(HH:MM, 기기 시간대) — 탈락 안내의 "14:32 판정"(camera), 안전 수칙 동의 시각(waiting-room)이 쓴다.
 */
export function formatClock(epochMs: number): string {
  const at = new Date(epochMs)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}
