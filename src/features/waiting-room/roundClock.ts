import type { RoundState } from './api/rooms'

/**
 * 진행 중인 라운드의 남은 시간(ms) — 서버 앵커(startedAtMs)와 총량(durationMs)에서 파생한다.
 *
 * 방 문서(RoundState)의 소유가 여기라 그 해석도 여기 둔다. 라운드 운영의 카운트다운과 대기실의
 * 콕핏 복귀 판정이 같은 함수를 봐야 두 화면이 같은 순간을 라운드의 끝으로 친다.
 * (라운드 시작 전 미리보기 기본값은 운영 화면의 관심사라 round-ops의 computeRemainingMs가 맡는다)
 */
export function computeRoundRemainingMs(round: RoundState, nowMs: number): number {
  if (round.status === 'paused') {
    return Math.max(0, round.pausedRemainingMs ?? round.durationMs)
  }
  // serverTimestamp 반영 전(startedAtMs null)은 방금 시작한 순간이라 총량이 곧 남은 시간이다.
  // 서버 시각이 로컬보다 조금 앞서도 남은 시간이 총량을 넘지 않게 한다.
  const elapsedMs = round.startedAtMs === null ? 0 : Math.max(0, nowMs - round.startedAtMs)
  return Math.max(0, round.durationMs - elapsedMs)
}

/**
 * 아직 뛸 시간이 남은 라운드인가 — 게스트를 카메라 콕핏으로 보낼지 가르는 기준이다.
 *
 * 타이머가 0에 닿아도 방 문서의 round는 호스트가 게임을 종료할 때까지 남는다. 그래서
 * 'round 필드가 있다'만으로 판단하면 종료 뒤 콕핏에서 나온 게스트를 대기실이 즉시 되밀어 낸다.
 * 올스탑(paused)은 남은 시간이 그대로 보존되므로 여기서는 살아 있는 라운드로 친다 —
 * 정지는 진행자가 곧 푸는 일시 상태라 플레이어가 콕핏을 떠날 이유가 없다.
 */
export function isRoundLive(round: RoundState | null, nowMs: number): boolean {
  return round !== null && computeRoundRemainingMs(round, nowMs) > 0
}
