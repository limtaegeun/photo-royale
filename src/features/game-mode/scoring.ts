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
 * 기본 킬 규칙 — 팀 킬 ×10(+낙오 3배 ×30)을 팀원 각자에게. 아직 자기 규칙이 없는 모드의 기본값이다
 * (일반전은 여기에 생존 보너스를 더한 normalScoring을 쓴다).
 */
export function killScoring(input: ModeScoringInput): ModeScoringOutput {
  const teamScores: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    teamScores[armband] = killScoreOf(input.tally, armband)
  }
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}

/**
 * 탈락 모델(P07 M3, docs/plans/p07-elimination.md) — 팀 라이프. 2인 팀 1, 1인 팀 2
 * (앱 규칙 카드 "1인 팀은 목숨과 포인트가 2배" 중 목숨 보정. 포인트 2배는 기획자 확인 전 미적용).
 */
export function livesOf(teams: ModeScoringInput['teams'], armband: string): number {
  return (teams[armband]?.length ?? 0) === 1 ? 2 : 1
}

/** 아웃 = 맞은 횟수(hits)가 라이프에 닿음. 원장에 별도 필드 없이 파생한다 */
export function isTeamOut(input: Pick<ModeScoringInput, 'teams' | 'hits'>, armband: string): boolean {
  return (input.hits[armband] ?? 0) >= livesOf(input.teams, armband)
}

/** 라운드 종료 시 생존(아웃 아님) 보너스 — 결정 5. 킬 없이 산 사람이 킬 없이 잡힌 사람보다 위 */
export const SURVIVAL_POINTS = 5

/** 팀별 생존 보너스 원점수 — 아웃 아닌 팀 SURVIVAL_POINTS, 아웃 팀 0 */
export function survivalScoreOf(input: Pick<ModeScoringInput, 'teams' | 'hits'>, armband: string): number {
  return isTeamOut(input, armband) ? 0 : SURVIVAL_POINTS
}

/** 일반전(P07 §4.1) — 팀 킬 10 · 낙오 포착 킬 30 · 종료 시 생존 5, 팀원 각자에게 */
export function normalScoring(input: ModeScoringInput): ModeScoringOutput {
  const teamScores: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    teamScores[armband] = killScoreOf(input.tally, armband) + survivalScoreOf(input, armband)
  }
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}
