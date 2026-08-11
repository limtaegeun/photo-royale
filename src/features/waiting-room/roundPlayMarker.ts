/**
 * 라운드 재실행 세션 가드 — 이 기기·이 탭에서 방의 특정 차수를 이미 플레이했는지 기록한다.
 *
 * 라운드 종료는 status만 waiting으로 되돌리고 assignmentRound는 보존한다(전원 레디도 유지).
 * 그래서 호스트가 '게임 시작'을 다시 누르면 같은 차수로 라운드가 재실행되고, 그 순간 직전
 * 라운드의 미판정 킬샷이 판정 큐에 부활하며 새 제출과 기록이 한 라운드로 뭉친다. 데이터
 * 모델에 "이 차수로 라운드를 돌렸다"는 마커가 없어 서버(rules) 강제는 후속 과제이고,
 * 진행자 기기는 보통 1대라 세션 로컬 가드로 UX에서 막는 것으로 충분하다.
 *
 * best-effort다: Safari 프라이빗 모드 등에서는 sessionStorage.setItem이 QuotaExceededError를
 * throw할 수 있다. 이 가드는 실행을 막는 필수 검증이 아니라 UX 안내이므로, 저장이 실패해도
 * 조용히 무시하고 사용자 플로우를 끊지 않는다.
 */

function storageKey(code: string, round: number): string {
  return `pr:round-played:${code}:${round}`
}

/** 방 코드 + 차수 조합을 "플레이했음"으로 기록한다. 저장 실패는 조용히 무시한다(가드는 best-effort). */
export function markRoundPlayed(code: string, round: number): void {
  try {
    sessionStorage.setItem(storageKey(code, round), '1')
  } catch {
    // sessionStorage 접근이 막힌 환경(프라이빗 모드 등) — 가드 없이 진행해도 치명적이지 않다
  }
}

/** 방 코드 + 차수 조합을 이번 세션에서 이미 플레이했는지 조회한다. 조회 실패도 조용히 false로 수렴한다. */
export function hasPlayedRound(code: string, round: number): boolean {
  try {
    return sessionStorage.getItem(storageKey(code, round)) !== null
  } catch {
    return false
  }
}
