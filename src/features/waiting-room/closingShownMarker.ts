/**
 * 마무리 페이지 노출 기록 — 이 기기에서 방의 특정 마무리(closedAt)를 이미 띄웠는지 남긴다.
 *
 * 마무리 페이지는 "한 번" 떠야 한다. 대기실이 방 문서의 마무리 시각을 보고 페이지로 보내는데, 참가자가
 * 순위를 다시 보려고 대기실로 돌아오면 같은 시각이 그대로라 또 보내게 된다. 그래서 본 마무리를
 * 시각까지 묶어 기록한다 — 진행자가 다시 마무리하면 시각이 바뀌어 한 번 더 뜬다.
 *
 * 새로고침·탭 재시작에도 다시 뜨지 않도록 localStorage에 둔다(roundPlayMarker의 sessionStorage와 다름).
 * best-effort다: 저장이 막힌 환경(프라이빗 모드 등)이면 대기실에 돌아올 때마다 다시 뜰 뿐 흐름은 끊지 않는다.
 */

function storageKey(code: string, closedAtMs: number): string {
  return `pr:closing-shown:${code}:${closedAtMs}`
}

/** 이 마무리를 "띄웠음"으로 기록한다. 저장 실패는 조용히 무시한다 */
export function markClosingShown(code: string, closedAtMs: number): void {
  try {
    localStorage.setItem(storageKey(code, closedAtMs), '1')
  } catch {
    // localStorage 접근이 막힌 환경 — 기록 없이 진행해도 페이지가 한 번 더 뜰 뿐이다
  }
}

/** 이 마무리를 이 기기에서 이미 띄웠는지. 조회 실패는 false로 수렴한다 */
export function hasShownClosing(code: string, closedAtMs: number): boolean {
  try {
    return localStorage.getItem(storageKey(code, closedAtMs)) !== null
  } catch {
    return false
  }
}
