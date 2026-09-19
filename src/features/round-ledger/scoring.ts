/**
 * 정산 계산기(P07) — 라운드 원장에서 원점수 → 등급 → 포인트를 내고, 원장 목록에서 누적 순위를
 * 낸다. 전부 순수 함수다(쓰기는 api/rounds.ts, 화면은 각 feature).
 *
 * 기획 docs/plans/p07-round-scoring.md §3 — 라운드 안은 원점수, 라운드 사이는 등급 포인트.
 * 원점수 규칙은 모드가 소유한다(GameModeDefinition.scoring — 모드 1개 = 파일 1개). 여기는
 * 모드와 무관한 등급·포인트 단계와 누적 순위만 맡는다.
 */
import { GAME_MODES, isTeamOut } from '@/features/game-mode'
import type { RoundLedger, RoundResult } from './types'

/**
 * 탈락 모델(P07 M3) — 원장 문서 기준 팀별 아웃 여부. 콕핏·판정 시트·운영 화면이 같은 함수를 쓴다.
 * 원장이 없는 라운드는 호출부가 null을 들고 있으므로 여기 오지 않는다.
 */
export function teamOutStatus(ledger: RoundLedger): Record<string, boolean> {
  const input = { teams: ledger.teams, hits: ledger.hits ?? {} }
  const status: Record<string, boolean> = {}
  for (const armband of Object.keys(ledger.teams)) status[armband] = isTeamOut(input, armband)
  return status
}

/** 아웃 아닌 팀 수 — 콕핏의 "생존 N / M팀" */
export function aliveTeamCount(ledger: RoundLedger): number {
  return Object.values(teamOutStatus(ledger)).filter((out) => !out).length
}

/**
 * 등급 → 포인트(결정 8). 인덱스 = 등급 - 1. 표 밖의 등급(5등급 이하)은 TIER_FLOOR_POINTS,
 * 원점수 0 이하(등급 0)는 ZERO_SCORE_POINTS(참가점), 라운드에 없던 사람은 0(결과에 없다).
 */
export const TIER_POINTS = [10, 7, 5, 3] as const
export const TIER_FLOOR_POINTS = 2
export const ZERO_SCORE_POINTS = 1

/** 등급 번호 → 포인트. 0등급(원점수 0 이하)은 참가점 */
export function pointsForTier(tier: number): number {
  if (tier <= 0) return ZERO_SCORE_POINTS
  return TIER_POINTS[tier - 1] ?? TIER_FLOOR_POINTS
}

/** 종료 시 원장에 쓰는 정산 — RoundResult에서 서버 시각만 뺀 것 */
export type RoundSettlement = Omit<RoundResult, 'finishedAtMs'>

/**
 * 개인 원점수 → 등급. 같은 점수는 같은 등급이고 다음 등급은 바로 이어진다(1-2-2-3, 결정 10) —
 * 등급 = "몇 번째로 높은 점수인가"라, 동점이 흔한 라운드에서도 점수를 낸 사람이 0점 아래로
 * 밀리지 않는다. 0 이하는 등급 0(= 등급 없음).
 */
export function rankTiers(playerScores: Record<string, number>): Record<string, number> {
  const distinctPositive = [...new Set(Object.values(playerScores).filter((score) => score > 0))]
    .sort((a, b) => b - a)
  const tierByScore = new Map(distinctPositive.map((score, index) => [score, index + 1]))
  const tiers: Record<string, number> = {}
  for (const [uid, score] of Object.entries(playerScores)) {
    tiers[uid] = tierByScore.get(score) ?? 0
  }
  return tiers
}

/**
 * 라운드 정산 — 원장의 모드가 가진 원점수 규칙으로 팀·개인 원점수를 낸 뒤 등급·포인트를 붙인다.
 * 개인 귀속(동일 지급·스냅샷 밖 uid 제외·편입자의 킬 크레딧)은 모드 규칙의 몫이라 여기서 다시 손대지 않는다.
 */
export function settleRound(ledger: RoundLedger): RoundSettlement {
  const { teamScores, playerScores } = GAME_MODES[ledger.mode].scoring({
    teams: ledger.teams,
    xTeams: ledger.xTeams,
    tally: ledger.tally ?? {},
    hits: ledger.hits ?? {},
    // 편입 모드(꼬리잡기)만 쓰는 키 — 없으면(null) 넘기지 않아 모드 규칙이 팀 킬 수로 정산한다
    credits: ledger.credits ?? undefined,
    tails: ledger.tails ?? undefined,
  })
  const playerTiers = rankTiers(playerScores)
  const playerPoints: Record<string, number> = {}
  for (const [uid, tier] of Object.entries(playerTiers)) playerPoints[uid] = pointsForTier(tier)
  return { teamScores, playerScores, playerTiers, playerPoints }
}

/** 정산을 등급별로 묶은 한 줄 — 종료 미리보기·발표가 "1등급 10P — 누구누구"로 읽는다 */
export interface TierGroup {
  /** 0 = 원점수 0 이하(등급 없음) */
  tier: number
  points: number
  /** 원점수 내림차순 → uid 오름차순 */
  uids: string[]
}

/** 정산 결과를 등급 오름차순(1등급 먼저, 등급 없음은 마지막)으로 묶는다 */
export function groupByTier(settlement: RoundSettlement): TierGroup[] {
  const byTier = new Map<number, string[]>()
  for (const [uid, tier] of Object.entries(settlement.playerTiers)) {
    const group = byTier.get(tier) ?? []
    group.push(uid)
    byTier.set(tier, group)
  }
  return [...byTier.entries()]
    .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map(([tier, uids]) => ({
      tier,
      points: pointsForTier(tier),
      uids: uids.sort(
        (a, b) =>
          (settlement.playerScores[b] ?? 0) - (settlement.playerScores[a] ?? 0) ||
          a.localeCompare(b),
      ),
    }))
}

/** 누적 순위 한 줄 — 화면은 uid를 참가자 명단과 조인해 이름을 붙인다 */
export interface Standing {
  uid: string
  /** 최종 순위. 동점(포인트·원점수 합·1등급 횟수 전부 같음)은 같은 순위, 다음은 인원수만큼 건너뜀 */
  rank: number
  /** 등급 포인트 합 — 최종 순위의 1차 기준 */
  points: number
  /** 라운드 원점수 합 — 동점 1차 타이브레이커(B가 버린 "얼마나 압도했나"를 되살린다) */
  rawScore: number
  /** 1등급 횟수 — 동점 2차 타이브레이커 */
  firstTierCount: number
  /** 라운드별 내역(차수 오름차순). 그 라운드에 없었으면 항목이 없다 */
  rounds: Array<{ roundNo: number; tier: number; points: number }>
}

/**
 * 누적 순위 — 정산이 끝난(result 있는) 라운드의 포인트를 uid별로 더한다. 별도 저장 없는
 * 파생값이라 정정(재종료)이 있어도 어긋날 사본이 없다. 동점 처리는 결정 6:
 * 포인트 합 → 원점수 합 → 1등급 횟수 → 그래도 같으면 공동 순위.
 */
export function computeStandings(ledgers: RoundLedger[]): Standing[] {
  const byUid = new Map<string, Standing>()
  for (const ledger of [...ledgers].sort((a, b) => a.roundNo - b.roundNo)) {
    const result = ledger.result
    if (result === null) continue
    for (const [uid, points] of Object.entries(result.playerPoints)) {
      const standing = byUid.get(uid) ?? {
        uid,
        rank: 0,
        points: 0,
        rawScore: 0,
        firstTierCount: 0,
        rounds: [],
      }
      const tier = result.playerTiers[uid] ?? 0
      standing.points += points
      standing.rawScore += result.playerScores[uid] ?? 0
      if (tier === 1) standing.firstTierCount += 1
      standing.rounds.push({ roundNo: ledger.roundNo, tier, points })
      byUid.set(uid, standing)
    }
  }

  const standings = [...byUid.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.rawScore - a.rawScore ||
      b.firstTierCount - a.firstTierCount ||
      a.uid.localeCompare(b.uid),
  )
  standings.forEach((standing, index) => {
    const previous = standings[index - 1]
    const tied =
      previous !== undefined &&
      previous.points === standing.points &&
      previous.rawScore === standing.rawScore &&
      previous.firstTierCount === standing.firstTierCount
    standing.rank = tied ? previous.rank : index + 1
  })
  return standings
}
