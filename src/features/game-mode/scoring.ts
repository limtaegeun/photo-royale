/**
 * 모드 공통 원점수 재료(P07 §4) — 기본 킬 규칙과 팀 점수의 개인 귀속.
 * 각 모드 파일의 scoring이 이것들로 자기 규칙을 조립한다. 등급·포인트 변환은 여기 없다
 * (모드와 무관한 공통 단계라 round-ledger가 맡는다).
 */
import { isSameGroup } from './armbandGroups'
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

/** 공격 완장 1개의 킬 건수 — 배율과 무관하게 잡은 횟수(그룹 동료 킬은 건수로 센다) */
export function killCountOf(tally: ModeScoringInput['tally'], armband: string): number {
  const entry = tally[armband]
  return (entry?.kills ?? 0) + (entry?.tripleKills ?? 0)
}

/**
 * 같은 그룹 다른 팀의 킬 1건 — 그룹원 각자에게(P07 §4.3, 결정 2). 직접 킬한 팀(10)이 그룹 동료(5)보다
 * 한 등급 위에 서도록 킬 점수의 절반이다. 그룹전·왕잡기가 쓴다.
 */
export const GROUP_ASSIST_POINTS = 5

/** 완장 1개의 그룹 동료 킬 원점수 — 같은 그룹의 다른 완장이 올린 킬 건수 × 5. 자기 킬은 제외 */
export function groupAssistScoreOf(input: Pick<ModeScoringInput, 'teams' | 'tally'>, armband: string): number {
  let assists = 0
  for (const other of Object.keys(input.teams)) {
    if (other === armband || !isSameGroup(armband, other)) continue
    assists += killCountOf(input.tally, other)
  }
  return assists * GROUP_ASSIST_POINTS
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
 * 1인 팀 보정 — 규칙서(앱 규칙 카드 "1인 팀은 목숨과 포인트가 2배")대로 1인 팀의 라운드 원점수는
 * 2배다(기획자 확정 2026-09-16). 라이프 2배는 livesOf가 맡는다. 모드와 무관한 편성 규칙이라
 * 모든 모드 규칙이 마지막에 이 보정을 거친다.
 */
export const SOLO_TEAM_SCALE = 2

/** 팀 원점수 배율 — 1인 팀 2, 그 외 1 */
export function teamScaleOf(teams: ModeScoringInput['teams'], armband: string): number {
  return (teams[armband]?.length ?? 0) === 1 ? SOLO_TEAM_SCALE : 1
}

/** 팀별 원점수에 1인 팀 배율을 적용한다 — 모드 규칙의 마지막 단계 */
export function applyTeamScale(
  teams: ModeScoringInput['teams'],
  teamScores: Record<string, number>,
): Record<string, number> {
  const scaled: Record<string, number> = {}
  for (const [armband, score] of Object.entries(teamScores)) {
    scaled[armband] = score * teamScaleOf(teams, armband)
  }
  return scaled
}

/**
 * 기본 킬 규칙 — 팀 킬 ×10(+낙오 3배 ×30)을 팀원 각자에게. 아직 자기 규칙이 없는 모드의 기본값이다
 * (일반전은 여기에 생존 보너스를 더한 normalScoring을 쓴다). 1인 팀은 2배(applyTeamScale).
 */
export function killScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = killScoreOf(input.tally, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}

/**
 * 탈락 모델(P07 M3, docs/plans/p07-elimination.md) — 팀 라이프. 2인 팀 1, 1인 팀 2
 * (앱 규칙 카드 "1인 팀은 목숨과 포인트가 2배" 중 목숨 보정. 포인트 2배는 applyTeamScale).
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

/** 일반전(P07 §4.1) — 팀 킬 10 · 낙오 포착 킬 30 · 종료 시 생존 5, 팀원 각자에게. 1인 팀은 2배 */
export function normalScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = killScoreOf(input.tally, armband) + survivalScoreOf(input, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}

/**
 * 그룹전(P07 §4.3) — 내 팀 킬 10 · 같은 그룹 다른 팀의 킬 5, 팀원 각자에게. 생존 보너스는 없다
 * (결정 5는 일반전·꼬리잡기 한정). 1인 팀은 2배.
 */
export function groupScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = killScoreOf(input.tally, armband) + groupAssistScoreOf(input, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}
