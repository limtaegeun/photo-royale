/**
 * 모드별 탈락 판정 — 기본은 팀 라이프(hits ≥ 라이프, scoring.ts isTeamOut)이고, 비밀 왕 모드(왕잡기)는 같은 그룹의
 * 왕이 아웃되면 그 그룹 전원도 아웃이다(노션 ② 왕잡기 "우리 왕이 잡히면 그 판은 그룹 전체가 즉시 아웃됩니다").
 * 콕핏 셔터 잠금·판정 카드 대상 제외·생존 팀 수·늦은 킬샷 자동 반려가 전부 이 판정을 쓴다(round-ledger
 * teamOutStatus). 서버(firestore.rules isTeamOutInLedger)도 같은 기준으로 탈락 팀의 제출을 막는다 — 바꾸면
 * 양쪽을 함께 갱신·배포할 것.
 */
import { GAME_MODES } from './registry'
import { isKingDownInGroup, isTeamOut } from './scoring'
import type { GameModeId, ModeScoringInput } from './types'

/** 이 팀이 이번 판에서 아웃인가 — 팀 라이프를 다 썼거나, 비밀 왕 모드에서 같은 그룹 왕이 잡혔다 */
export function isTeamEliminated(
  mode: GameModeId,
  input: Pick<ModeScoringInput, 'teams' | 'hits' | 'xTeams'>,
  armband: string,
): boolean {
  if (isTeamOut(input, armband)) return true
  return GAME_MODES[mode].secretKing === true && isKingDownInGroup(input, armband)
}
