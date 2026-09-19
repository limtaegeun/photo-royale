import { describe, it, expect } from 'vitest'
import { aliveTeamCount, computeStandings, groupByTier, pointsForTier, rankTiers, settleRound, teamOutStatus } from '../scoring'
import type { RoundLedger } from '../types'

function ledger(overrides: Partial<RoundLedger> = {}): RoundLedger {
  return {
    roundNo: 1,
    mode: 'normal',
    teams: { A: ['하늘', '민재'], B: ['준호', '소율'], C: ['서연', '도윤'] },
    xTeams: [],
    confirmedAtMs: 0,
    tally: null,
    hits: null,
    tails: null,
    credits: null,
    result: null,
    ...overrides,
  }
}

describe('pointsForTier', () => {
  it('등급 표 10/7/5/3, 5등급부터 2, 0등급(원점수 0 이하)은 참가점 1', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(pointsForTier)).toEqual([1, 10, 7, 5, 3, 2, 2])
  })
})

describe('rankTiers', () => {
  it('같은 점수는 같은 등급이고 다음 등급은 바로 이어진다(1-2-2-3)', () => {
    expect(rankTiers({ a: 40, b: 10, c: 10, d: 10, e: 30 })).toEqual({
      a: 1,
      e: 2,
      b: 3,
      c: 3,
      d: 3,
    })
  })

  it('0 이하는 등급 0 — 음수(왕잡기 감점)도 등급을 잃는 것으로 작용한다', () => {
    expect(rankTiers({ a: 10, b: 0, c: -10 })).toEqual({ a: 1, b: 0, c: 0 })
  })

  it('킬이 한 팀에서만 나면 1등급과 0등급 두 칸뿐이다', () => {
    expect(rankTiers({ a: 10, b: 10, c: 0 })).toEqual({ a: 1, b: 1, c: 0 })
  })
})

describe('settleRound', () => {
  /**
   * 일반전 = 킬 10·3배 30 + 생존 5(탈락 모델 M3: 맞은 횟수가 라이프에 닿으면 아웃, 아웃은 보너스 없음).
   * 기획 §예시 라운드 1에서 A·B는 잡혀서(hits) 아웃, C만 생존이다.
   */
  it('팀 킬 ×10 + 생존 5를 팀원 전원에게 동일 지급하고 등급·포인트를 낸다 — 기획 §예시 라운드 1', () => {
    const settlement = settleRound(
      ledger({
        tally: {
          C: { kills: 1, tripleKills: 1, kingKills: 0 },
          A: { kills: 1, tripleKills: 0, kingKills: 0 },
          B: { kills: 1, tripleKills: 0, kingKills: 0 },
        },
        hits: { A: 1, B: 1 },
      }),
    )

    expect(settlement.teamScores).toEqual({ A: 10, B: 10, C: 45 })
    expect(settlement.playerScores).toEqual({
      하늘: 10,
      민재: 10,
      준호: 10,
      소율: 10,
      서연: 45,
      도윤: 45,
    })
    expect(settlement.playerTiers).toEqual({ 서연: 1, 도윤: 1, 하늘: 2, 민재: 2, 준호: 2, 소율: 2 })
    expect(settlement.playerPoints).toEqual({ 서연: 10, 도윤: 10, 하늘: 7, 민재: 7, 준호: 7, 소율: 7 })
  })

  it('킬 없이 잡힌 팀은 원점수 0, 등급 0, 참가점 1 — 킬 없이 살아남은 팀은 생존 5로 한 등급 위', () => {
    const settlement = settleRound(ledger({ tally: { A: { kills: 2, tripleKills: 0, kingKills: 0 } }, hits: { B: 1 } }))

    expect(settlement.teamScores).toEqual({ A: 25, B: 0, C: 5 })
    expect(settlement.playerTiers).toEqual({ 하늘: 1, 민재: 1, 준호: 0, 소율: 0, 서연: 2, 도윤: 2 })
    expect(settlement.playerPoints.준호).toBe(1)
    expect(settlement.playerPoints.서연).toBe(7)
  })

  it('판정이 하나도 없으면(tally null) 전원 생존 5 → 전원 1등급 10포인트', () => {
    const settlement = settleRound(ledger())

    expect(Object.values(settlement.teamScores)).toEqual([5, 5, 5])
    expect(Object.values(settlement.playerPoints)).toEqual([10, 10, 10, 10, 10, 10])
  })

  it('편성 스냅샷에 없는 uid는 결과에 없다 — 집계에만 있는 완장도 무시한다', () => {
    const settlement = settleRound(
      ledger({ teams: { A: ['하늘'] }, tally: { A: { kills: 1, tripleKills: 0, kingKills: 0 }, Z: { kills: 5, tripleKills: 0, kingKills: 0 } } }),
    )

    // 하늘은 1인 팀 — (킬 10 + 생존 5) × 2
    expect(settlement.teamScores).toEqual({ A: 30 })
    expect(Object.keys(settlement.playerPoints)).toEqual(['하늘'])
  })

  it('1인 팀은 규칙서대로 원점수가 2배다 — 같은 킬 1이면 30 vs 15로 한 등급 위', () => {
    const settlement = settleRound(
      ledger({ teams: { A: ['혼자'], B: ['둘', '이서'] }, tally: { A: { kills: 1, tripleKills: 0, kingKills: 0 }, B: { kills: 1, tripleKills: 0, kingKills: 0 } } }),
    )

    expect(settlement.playerScores).toEqual({ 혼자: 30, 둘: 15, 이서: 15 })
    expect(settlement.playerTiers).toEqual({ 혼자: 1, 둘: 2, 이서: 2 })
  })

  it('1인 팀은 라이프가 2라 한 번 맞아도 생존 보너스를 받는다(2배 → 10)', () => {
    const settlement = settleRound(ledger({ teams: { A: ['혼자'], B: ['둘', '이서'] }, hits: { A: 1, B: 1 } }))

    expect(settlement.teamScores).toEqual({ A: 10, B: 0 })
  })
})

describe('settleRound — 모드 위임', () => {
  it('원장의 모드가 가진 scoring으로 원점수를 내고 등급·포인트만 붙인다', () => {
    // 일반전은 생존 5가 붙고, 아직 자기 규칙이 없는 모드(그룹전)는 기본 킬 규칙뿐이다
    const base = ledger({ tally: { A: { kills: 1, tripleKills: 0, kingKills: 0 } } })
    const asNormal = settleRound({ ...base, mode: 'normal' })
    const asGroup = settleRound({ ...base, mode: 'group' })

    expect(asNormal.teamScores).toEqual({ A: 15, B: 5, C: 5 })
    expect(asGroup.teamScores).toEqual({ A: 10, B: 0, C: 0 })
    expect(asGroup.playerPoints).toEqual({ 하늘: 10, 민재: 10, 준호: 1, 소율: 1, 서연: 1, 도윤: 1 })
  })
})

describe('teamOutStatus · aliveTeamCount (탈락 모델)', () => {
  it('맞은 횟수가 라이프에 닿은 팀만 아웃이고 생존 팀 수를 센다 — 1인 팀은 라이프 2', () => {
    const l = ledger({ teams: { A: ['하늘', '민재'], B: ['혼자'], C: ['서연', '도윤'] }, hits: { A: 1, B: 1 } })

    expect(teamOutStatus(l)).toEqual({ A: true, B: false, C: false })
    expect(aliveTeamCount(l)).toBe(2)
  })

  it('hits가 없으면 전원 생존', () => {
    expect(aliveTeamCount(ledger())).toBe(3)
  })
})

describe('groupByTier', () => {
  it('1등급부터 차례로 묶고 등급 없음(0점 이하)은 마지막에 둔다', () => {
    const groups = groupByTier({
      teamScores: {},
      playerScores: { 서연: 40, 도윤: 40, 하늘: 10, 준호: 0, 민재: -10 },
      playerTiers: { 서연: 1, 도윤: 1, 하늘: 2, 준호: 0, 민재: 0 },
      playerPoints: { 서연: 10, 도윤: 10, 하늘: 7, 준호: 1, 민재: 1 },
    })

    expect(groups).toEqual([
      { tier: 1, points: 10, uids: ['도윤', '서연'] },
      { tier: 2, points: 7, uids: ['하늘'] },
      { tier: 0, points: 1, uids: ['준호', '민재'] },
    ])
  })

  it('정산할 사람이 없으면 빈 목록', () => {
    expect(
      groupByTier({ teamScores: {}, playerScores: {}, playerTiers: {}, playerPoints: {} }),
    ).toEqual([])
  })
})

describe('computeStandings', () => {
  /** 결과만 있으면 되는 원장 — 기획 §예시 라운드 1·2 */
  const round1 = ledger({
    roundNo: 1,
    result: {
      teamScores: { A: 10, B: 0, C: 40, F: 10 },
      playerScores: { 하늘: 10, 민재: 10, 준호: 0, 서연: 40, 도윤: 40 },
      playerTiers: { 하늘: 2, 민재: 2, 준호: 0, 서연: 1, 도윤: 1 },
      playerPoints: { 하늘: 7, 민재: 7, 준호: 1, 서연: 10, 도윤: 10 },
      finishedAtMs: 1,
    },
  })
  const round2 = ledger({
    roundNo: 2,
    result: {
      teamScores: { E: 30, A: 20, B: 10, D: 0, F: 0 },
      playerScores: { 하늘: 30, 준호: 20, 도윤: 10, 서연: 0, 민재: 0 },
      playerTiers: { 하늘: 1, 준호: 2, 도윤: 3, 서연: 0, 민재: 0 },
      playerPoints: { 하늘: 10, 준호: 7, 도윤: 5, 서연: 1, 민재: 1 },
      finishedAtMs: 2,
    },
  })

  it('포인트 합 내림차순 — 두 라운드 모두 상위권인 사람이 한 라운드 폭발보다 위다', () => {
    const standings = computeStandings([round2, round1])

    expect(standings.map((s) => [s.rank, s.uid, s.points, s.rawScore])).toEqual([
      [1, '하늘', 17, 40],
      [2, '도윤', 15, 50],
      [3, '서연', 11, 40],
      [4, '준호', 8, 20],
      [5, '민재', 8, 10],
    ])
  })

  it('라운드 내역은 차수 오름차순이고 없던 라운드는 항목이 없다', () => {
    const standings = computeStandings([
      round2,
      round1,
      ledger({
        roundNo: 3,
        result: {
          teamScores: { A: 10 },
          playerScores: { 신입: 10 },
          playerTiers: { 신입: 1 },
          playerPoints: { 신입: 10 },
          finishedAtMs: 3,
        },
      }),
    ])

    expect(standings.find((s) => s.uid === '하늘')?.rounds).toEqual([
      { roundNo: 1, tier: 2, points: 7 },
      { roundNo: 2, tier: 1, points: 10 },
    ])
    expect(standings.find((s) => s.uid === '신입')?.rounds).toEqual([{ roundNo: 3, tier: 1, points: 10 }])
  })

  it('포인트 동점은 원점수 합으로 가른다(준호 20 > 민재 10)', () => {
    const [, , , fourth, fifth] = computeStandings([round1, round2])

    expect(fourth?.uid).toBe('준호')
    expect(fifth?.uid).toBe('민재')
  })

  it('원점수 합까지 같으면 1등급 횟수, 그래도 같으면 공동 순위이고 다음 순위는 인원수만큼 건너뛴다', () => {
    const standings = computeStandings([
      ledger({
        roundNo: 1,
        result: {
          teamScores: {},
          playerScores: { 갑: 30, 을: 30, 병: 30, 정: 0 },
          playerTiers: { 갑: 1, 을: 1, 병: 1, 정: 0 },
          playerPoints: { 갑: 10, 을: 10, 병: 10, 정: 1 },
          finishedAtMs: 1,
        },
      }),
      ledger({
        roundNo: 2,
        result: {
          teamScores: {},
          playerScores: { 갑: 20, 을: 20, 병: 10, 정: 30 },
          playerTiers: { 갑: 2, 을: 2, 병: 3, 정: 1 },
          playerPoints: { 갑: 7, 을: 7, 병: 5, 정: 10 },
          finishedAtMs: 2,
        },
      }),
    ])

    expect(standings.map((s) => [s.rank, s.uid, s.points, s.rawScore, s.firstTierCount])).toEqual([
      [1, '갑', 17, 50, 1],
      [1, '을', 17, 50, 1],
      [3, '병', 15, 40, 1],
      [4, '정', 11, 30, 1],
    ])
  })

  it('정산이 없는(result null) 라운드는 무시하고, 라운드가 하나도 없으면 빈 목록', () => {
    expect(computeStandings([ledger({ roundNo: 1 })])).toEqual([])
    expect(computeStandings([])).toEqual([])
  })
})
