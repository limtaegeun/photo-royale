/**
 * 모드 공통 원점수 재료(P07 §4) — 기본 킬 규칙과 팀 점수의 개인 귀속.
 * 각 모드 파일의 scoring이 이것들로 자기 규칙을 조립한다. 등급·포인트 변환은 여기 없다
 * (모드와 무관한 공통 단계라 round-ledger가 맡는다).
 */
import { isSameGroup } from './armbandGroups'
import type { ModeScoringInput, ModeScoringOutput } from './types'

/** 킬 1건의 원점수 — 노션 ② 기본 규칙 5 "킬샷 1번에 +10점이에요" */
export const KILL_POINTS = 10
/** 낙오(팀원과 2m 이탈) 포착 킬 — 판정 카드 토글로 호스트가 정한다(M2) */
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
 * 그룹 점수 — 같은 그룹 모든 팀(이 팀 포함)의 킬 원점수 합. 노션 ② 그룹전 카드 "그룹이 함께 번 점수와 우리 팀 점수를
 * 더해서 계산해요"의 "그룹이 함께 번 점수"다. 그룹이 없는 완장(X)은 자기 킬 원점수만 센다.
 */
export function groupKillScoreOf(input: Pick<ModeScoringInput, 'teams' | 'tally'>, armband: string): number {
  let total = 0
  for (const other of Object.keys(input.teams)) {
    if (other === armband || isSameGroup(armband, other)) total += killScoreOf(input.tally, other)
  }
  return total
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
 * 1인 팀 보정 — 노션 ② 기본 규칙 5 "짝꿍이 오지 않아 혼자 남은 팀은 체력과 점수가 2배예요"대로 1인 팀의
 * 라운드 원점수는 2배다. 양수 원점수에만 적용한다(감점은 1배, 기획자 확정 2026-09-20 — 지금 규칙에는 감점이
 * 없지만 기준은 남긴다). 라이프 2배는 livesOf가 맡는다. 모드와 무관한 편성 규칙이라 모든 모드 규칙이 마지막에
 * 이 보정을 거친다.
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
  /**
   * 공격 팀원을 꼬리에 끌고 있는 완장 — 공격 팀이 이 판정 전에 이미 잡혀 편입된 곳(연쇄 편입이면 전부).
   * 합류 인원을 공격 완장의 tails와 함께 이 완장들의 tails에도 넣어야, 잡히기 전에 찍은 사진을 나중에
   * 판정해도 먼저 판정한 것과 원장이 같아진다. 공격 팀이 살아 있으면 빈 배열
   */
  absorbedIntoTeams: string[]
}

/** 두 uid 목록의 합집합 — 같은 uid가 두 번 쓰이지 않게(팀원이 꼬리에도 들어간 손상 데이터 방어) */
function unionUids(members: string[] | undefined, tails: string[] | undefined): string[] {
  return [...new Set([...(members ?? []), ...(tails ?? [])])]
}

/**
 * 킬 1건의 편입 효과(P07 §4.2 "킬 +10 → 킬 시점의 사냥 팀 소속 전원 — 편입돼 있던 인원 포함").
 * 크레딧은 공격 팀의 현재 소속(팀원 ∪ 꼬리), 합류는 이 킬로 target의 hits가 라이프에 닿을 때만 —
 * 1인 팀은 라이프 2라 첫 히트로는 합류하지 않는다. 판정 시점의 원장(hits·tails)을 넘긴다.
 * 공격 팀이 이미 잡힌 뒤 판정되는 킬(잡히기 전에 찍은 사진)은 합류 인원이 탈락한 팀 꼬리에만 남아 그 뒤
 * 크레딧을 못 받았다(10/9 리허설 문제 6) — 공격 팀원이 든 꼬리의 주인을 absorbedIntoTeams로 같이 돌려준다.
 */
export function absorbKillEffect(
  input: Pick<ModeScoringInput, 'teams' | 'hits' | 'tails'>,
  attacker: string,
  target: string,
): AbsorbKillEffect {
  const tails = input.tails ?? {}
  const targetOutAfterKill = (input.hits[target] ?? 0) + 1 >= livesOf(input.teams, target)
  const attackerMembers = input.teams[attacker] ?? []
  return {
    creditUids: unionUids(input.teams[attacker], tails[attacker]),
    absorbedUids: targetOutAfterKill ? unionUids(input.teams[target], tails[target]) : [],
    absorbedIntoTeams: Object.entries(tails)
      .filter(
        ([armband, uids]) =>
          armband !== attacker && uids.some((uid) => attackerMembers.includes(uid)),
      )
      .map(([armband]) => armband)
      .sort(),
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

/** 왕잡기 — 왕을 잡은 킬. 잡은 팀이 킬 10 대신 받는다(노션 ② 왕잡기 "왕을 잡으면 잡은 사람이 +30점") */
export const KING_HUNT_POINTS = 30
/** 왕잡기 — 왕을 잡은 팀의 그룹 전체(잡은 팀 포함)가 받는다(노션 ② 왕잡기 "그룹 전체는 +10점") */
export const KING_HUNT_GROUP_POINTS = 10

/**
 * 왕잡기 공격 완장 1개의 킬 원점수 — 왕을 잡은 건(kingKills)은 30, 나머지 건은 10(노션 ② 기본 규칙 5 "킬샷 1번에
 * +10점"). 낙오 3배는 일반전 한정이라 tripleKills도 일반 건으로 센다. kingKills는 왕을 아웃시킨 킬만 센다.
 */
export function kingHuntKillScoreOf(input: Pick<ModeScoringInput, 'tally'>, armband: string): number {
  const events = killCountOf(input.tally, armband)
  const hunts = Math.min(input.tally[armband]?.kingKills ?? 0, events)
  return hunts * KING_HUNT_POINTS + (events - hunts) * KILL_POINTS
}

/** 완장 1개의 왕 사냥 그룹 보너스 — 같은 그룹 모든 팀(이 팀 포함)이 잡은 왕 수 × 10 */
export function kingHuntGroupBonusOf(input: Pick<ModeScoringInput, 'teams' | 'tally'>, armband: string): number {
  let hunts = 0
  for (const other of Object.keys(input.teams)) {
    if (other !== armband && !isSameGroup(armband, other)) continue
    hunts += Math.min(input.tally[other]?.kingKills ?? 0, killCountOf(input.tally, other))
  }
  return hunts * KING_HUNT_GROUP_POINTS
}

/**
 * 왕잡기 그룹 탈락 — 노션 ② 왕잡기 "우리 왕이 잡히면 그 판은 그룹 전체가 즉시 아웃됩니다". 같은 그룹의 왕(X 겸직 팀)이
 * 아웃(hits ≥ 라이프)이면 이 팀도 아웃이다. 그룹이 없는 완장(X)은 해당하지 않는다. 모드 정의의 secretKing이 켜진
 * 모드만 이 판정을 쓴다(elimination.ts isTeamEliminated).
 */
export function isKingDownInGroup(
  input: Pick<ModeScoringInput, 'teams' | 'hits' | 'xTeams'>,
  armband: string,
): boolean {
  return input.xTeams.some(
    (king) => king in input.teams && isSameGroup(king, armband) && isTeamOut(input, king),
  )
}

/**
 * 왕잡기(노션 ② 왕잡기 카드) — 킬 10 · 왕을 잡은 킬 30 · 왕을 잡은 팀의 그룹 전체(잡은 팀 포함) +10, 팀원 각자에게.
 * 왕이 잡힌 그룹은 감점 없이 그 판에서 전원 아웃된다(isKingDownInGroup). 생존 보너스 없음, 1인 팀 2배.
 */
export function kingHuntScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = kingHuntKillScoreOf(input, armband) + kingHuntGroupBonusOf(input, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}

/**
 * 그룹전(노션 ② 그룹전 카드 "그룹이 함께 번 점수와 우리 팀 점수를 더해서 계산해요") — 우리 팀 킬 원점수 + 그룹 점수
 * (같은 그룹 모든 팀의 킬 원점수 합, 우리 팀 포함), 팀원 각자에게. 그래서 우리 팀 킬은 20, 같은 그룹 다른 팀의 킬은
 * 10이 된다. 생존 보너스는 없다(결정 5는 일반전·꼬리잡기 한정). 1인 팀은 2배.
 */
export function groupScoring(input: ModeScoringInput): ModeScoringOutput {
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) {
    raw[armband] = killScoreOf(input.tally, armband) + groupKillScoreOf(input, armband)
  }
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}

/**
 * 스태프 추격전 — 참가자 전원이 살아남았을 때 모두가 받는 원점수. 킬샷 1번(+10)과 같은 크기로 잡았다 — 노션 ②는
 * "많을수록 모두의 점수가 올라가요"까지만 정해서 수치는 개발 판단이다(기획 확인 필요). 인원이 12명이든 40명이든
 * 같은 크기가 되게 생존자 수가 아니라 생존 비율에 곱한다(기획서 §3.5 "생존 비율에 비례한 전체 점수").
 */
export const STAFF_CHASE_FULL_SURVIVAL_POINTS = 10

/** 스태프 추격전의 생존자 수와 참가자 수 — 아웃 아닌 팀의 팀원이 생존자다 */
export function staffChaseHeadcount(input: Pick<ModeScoringInput, 'teams' | 'hits'>): {
  survivors: number
  participants: number
} {
  let survivors = 0
  let participants = 0
  for (const [armband, memberIds] of Object.entries(input.teams)) {
    participants += memberIds.length
    if (!isTeamOut(input, armband)) survivors += memberIds.length
  }
  return { survivors, participants }
}

/**
 * 스태프 추격전(노션 ② 스태프 추격전 카드 "이번엔 모두가 한편이에요 … 끝까지 살아남은 사람이 많을수록 모두의 점수가
 * 올라가요") — 생존 비율 × 10을 반올림해 참가자 모두에게 같게 준다. 잡힌 사람도 같은 점수다(모두가 한편). 킬은 없다
 * (스태프의 태그는 호스트의 수동 아웃 처리 = hits로만 들어온다). 1인 팀은 2배(노션 ② 기본 규칙 5).
 */
export function staffChaseScoring(input: ModeScoringInput): ModeScoringOutput {
  const { survivors, participants } = staffChaseHeadcount(input)
  const shared =
    participants === 0 ? 0 : Math.round((STAFF_CHASE_FULL_SURVIVAL_POINTS * survivors) / participants)
  const raw: Record<string, number> = {}
  for (const armband of Object.keys(input.teams)) raw[armband] = shared
  const teamScores = applyTeamScale(input.teams, raw)
  return { teamScores, playerScores: distributeToPlayers(input.teams, teamScores) }
}
