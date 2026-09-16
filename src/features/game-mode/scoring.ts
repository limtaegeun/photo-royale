/**
 * 모드 공통 원점수 재료(P07 §4) — 기본 킬 규칙과 팀 점수의 개인 귀속.
 * 각 모드 파일의 scoring이 이것들로 자기 규칙을 조립한다. 등급·포인트 변환은 여기 없다
 * (모드와 무관한 공통 단계라 round-ledger가 맡는다).
 */
import type { ModeScoringInput, ModeScoringOutput } from './types'

/** 킬 1건의 원점수 — 기획서의 3배(+30)·2배(+20)에서 역산한 확정값 */
export const KILL_POINTS = 10
/** 낙오(팀원과 2m 이탈) 포착 킬 — 판정 시트 토글로 호스트가 정한다(M2) */
export const TRIPLE_KILL_POINTS = 30

/** 공격 완장 1개의 킬 원점수 — 일반 킬 10 + 낙오 3배 킬 30 */
export function killScoreOf(tally: ModeScoringInput['tally'], armband: string): number {
  const entry = tally[armband]
  return (entry?.kills ?? 0) * KILL_POINTS + (entry?.tripleKills ?? 0) * TRIPLE_KILL_POINTS
}

/**
 * 팀 원점수를 팀원 전원에게 동일 지급한다(결정: 나누지 않는다 — 1인 팀에 중립).
 * 스냅샷에 없는 uid는 결과에 없다(= 그 라운드 미참가, 결정 11).
 */
export function distributeToPlayers(
  teams: ModeScoringInput['teams'],
  teamScores: Record<string, number>,
): Record<string, number> {
  const playerScores: Record<string, number> = {}
  for (const [armband, memberIds] of Object.entries(teams)) {
    for (const uid of memberIds) playerScores[uid] = teamScores[armband] ?? 0
  }
  return playerScores
}

/**
 * 기본 킬 규칙 — 팀 킬 ×10(+낙오 3배 ×30)을 팀원 각자에게. 일반전의 규칙이자, 아직 자기 규칙이
 * 없는 모드의 기본값이다(오늘까지 모든 모드가 이렇게 정산됐다).
 */
export function killScoring(input: ModeScoringInput): ModeScoringOutput {
  const teamScores: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    teamScores[armband] = killScoreOf(input.tally, armband)
  }
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}
