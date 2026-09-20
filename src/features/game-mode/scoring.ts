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
 * 2배다(기획자 확정 2026-09-16). 단 2배는 혼자 뛰는 불리함의 보상이라 양수 원점수에만 적용하고,
 * 왕 아웃 같은 그룹 감점은 본인 잘못이 아니라 1배 그대로다(기획자 확정 2026-09-20). 라이프 2배는
 * livesOf가 맡는다. 모드와 무관한 편성 규칙이라 모든 모드 규칙이 마지막에 이 보정을 거친다.
 */
export const SOLO_TEAM_SCALE = 2

/** 팀 원점수 배율 — 1인 팀 2, 그 외 1 */
export function teamScaleOf(teams: ModeScoringInput['teams'], armband: string): number {
  return (teams[armband]?.length ?? 0) === 1 ? SOLO_TEAM_SCALE : 1
}

/** 원점수 1개에 1인 팀 배율을 적용한다 — 양수일 때만(감점은 1배, 기획자 확정 2026-09-20) */
export function scaleTeamScore(teams: ModeScoringInput['teams'], armband: string, score: number): number {
  return score > 0 ? score * teamScaleOf(teams, armband) : score
}

/** 팀별 원점수에 1인 팀 배율을 적용한다 — 모드 규칙의 마지막 단계. 양수 원점수만 2배(감점은 1배) */
export function applyTeamScale(
  teams: ModeScoringInput['teams'],
  teamScores: Record<string, number>,
): Record<string, number> {
  const scaled: Record<string, number> = {}
  for (const [armband, score] of Object.entries(teamScores)) {
    scaled[armband] = scaleTeamScore(teams, armband, score)
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
 * 편입 모드(꼬리잡기)의 킬 1건이 원장에 남길 것 — 킬 시점의 사냥 팀 소속 전원(팀원 + 꼬리)의 크레딧과,
 * 이 킬로 잡힌 팀이 아웃되면 잡은 팀 꼬리로 합류할 uid. 판정 배치(round-ledger addTallyToBatch)가 그대로 쓴다.
 */
export interface AbsorbKillEffect {
  /** 이 킬로 크레딧 1을 받을 uid — 공격 팀원 + 이미 그 팀 꼬리로 편입돼 있던 인원. 이 킬로 합류하는 인원은 아니다 */
  creditUids: string[]
  /** 이 킬로 target이 아웃될 때만 채워진다(target 팀원 + target이 끌던 꼬리). 아니면 빈 배열 */
  absorbedUids: string[]
}

/** 두 uid 목록의 합집합 — 같은 uid가 두 번 쓰이지 않게(팀원이 꼬리에도 들어간 손상 데이터 방어) */
function unionUids(members: string[] | undefined, tails: string[] | undefined): string[] {
  return [...new Set([...(members ?? []), ...(tails ?? [])])]
}

/**
 * 킬 1건의 편입 효과(P07 §4.2 "킬 +10 → 킬 시점의 사냥 팀 소속 전원 — 편입돼 있던 인원 포함").
 * 크레딧은 공격 팀의 현재 소속(팀원 ∪ 꼬리), 합류는 이 킬로 target의 hits가 라이프에 닿을 때만 —
 * 1인 팀은 라이프 2라 첫 히트로는 합류하지 않는다. 판정 시점의 원장(hits·tails)을 넘긴다.
 */
export function absorbKillEffect(
  input: Pick<ModeScoringInput, 'teams' | 'hits' | 'tails'>,
  attacker: string,
  target: string,
): AbsorbKillEffect {
  const tails = input.tails ?? {}
  const targetOutAfterKill = (input.hits[target] ?? 0) + 1 >= livesOf(input.teams, target)
  return {
    creditUids: unionUids(input.teams[attacker], tails[attacker]),
    absorbedUids: targetOutAfterKill ? unionUids(input.teams[target], tails[target]) : [],
  }
}

/**
 * 꼬리잡기(P07 §4.2) — 킬 10 · 종료 시 미편입 생존 5(잡히지 않은 팀 = 아웃 아님). 1인 팀은 2배.
 * 팀 원점수는 공격 완장의 tally 기준 그대로다. 개인 원점수는 원장에 킬 크레딧(credits)이 있으면
 * "내가 받은 크레딧 × 10 + 원래 완장의 생존 5"로 낸다 — 편입자는 원래 완장의 생존 판정(잡혔으니 0)과
 * 새 팀에서 받은 킬 크레딧을 합쳐 개인 원점수가 팀원과 달라지고, 등급은 개인 단위라 그대로 처리된다(결정 9).
 * 1인 팀 2배는 그 사람의 원래 편성을 따른다. credits가 없으면(편입 도입 전 문서) 팀 원점수 동일 지급이다.
 * 낙오 3배 토글은 일반전 한정이라 크레딧에는 배율이 없다.
 */
export function tailChaseScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = killScoreOf(input.tally, armband) + survivalScoreOf(input, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  const credits = input.credits
  if (credits === undefined) {
    return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
  }
  const playerScores: Record<string, number> = {}
  for (const [armband, memberIds] of Object.entries(input.teams)) {
    const survival = survivalScoreOf(input, armband)
    for (const uid of memberIds) {
      const creditRaw = (credits[uid] ?? 0) * KILL_POINTS + survival
      playerScores[uid] = scaleTeamScore(input.teams, armband, creditRaw)
    }
  }
  return { teamScores, playerScores }
}

/** 왕(X 겸직 팀)의 킬 — 일반 킬의 2배(P07 §4.4) */
export const KING_KILL_POINTS = 20
/** 왕 사냥 — 상대 왕을 잡은 킬. 누가 잡았든 3배 */
export const KING_HUNT_POINTS = 30
/** 왕 아웃 — 잡힌 왕의 그룹원 각자 감점(결정 3: 즉시 패배 대신 감점, 라운드 계속) */
export const KING_OUT_PENALTY = -20

/**
 * 왕잡기 공격 완장 1개의 킬 원점수 — 왕 사냥 건(kingKills)은 30, 나머지 건은 왕이면 20·아니면 10.
 * 낙오 3배는 일반전 한정이라 tripleKills도 일반 건으로 센다.
 */
export function kingHuntKillScoreOf(
  input: Pick<ModeScoringInput, 'tally' | 'xTeams'>,
  armband: string,
): number {
  const events = killCountOf(input.tally, armband)
  const hunts = Math.min(input.tally[armband]?.kingKills ?? 0, events)
  const perKill = input.xTeams.includes(armband) ? KING_KILL_POINTS : KILL_POINTS
  return hunts * KING_HUNT_POINTS + (events - hunts) * perKill
}

/**
 * 왕잡기(P07 §4.4) — 킬(일반 10 · 왕 20 · 왕 사냥 30) + 그룹 동료 킬 5, 잡힌 왕(hits ≥ 라이프)의
 * 같은 그룹 전원(왕 팀 포함) −20. 팀원 각자에게, 생존 보너스 없음, 1인 팀 2배.
 */
export function kingHuntScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = kingHuntKillScoreOf(input, armband) + groupAssistScoreOf(input, armband)
  }
  for (const king of input.xTeams) {
    if (!(king in input.teams) || !isTeamOut(input, king)) continue
    for (const armband of Object.keys(input.teams)) {
      if (isSameGroup(king, armband)) raw[armband]! += KING_OUT_PENALTY
    }
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

/** 스태프 추격전 — 라운드 끝까지 스태프에게 잡히지 않은 팀원 각자(P07 §4.5, 결정 4: 생존자가 위 등급) */
export const STAFF_SURVIVAL_POINTS = 15
/** 스태프 추격전 — 스태프에게 잡혀 아웃된 팀원 각자(아래 등급) */
export const STAFF_OUT_POINTS = 5

/**
 * 스태프 추격전(P07 §4.5) — 생존 15 · 아웃 5, 팀원 각자에게. 킬은 없다(참가자 전원이 동맹이고
 * 스태프의 태그는 호스트의 수동 아웃 처리 = hits로만 들어온다). 결정 7(모든 모드 마지막 단계 ×2)과
 * 배정 카드 문구 "1인 팀 · 목숨과 포인트 2배"를 따라 1인 팀 2배를 적용한다 — 등급은 1인 생존 30 ·
 * 생존 15 · 1인 아웃 10 · 아웃 5로 넷이 될 수 있지만 "생존자 위·아웃자 아래"(결정 4)는 유지된다
 * (기획자 확정 2026-09-20, #45의 예외를 되돌림).
 */
export function staffChaseScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = isTeamOut(input, armband) ? STAFF_OUT_POINTS : STAFF_SURVIVAL_POINTS
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}
