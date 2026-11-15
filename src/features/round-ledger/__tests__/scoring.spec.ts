import { describe, it, expect } from 'vitest'
import {
  aliveTeamCount,
  computeStandings,
  formatRoundScores,
  groupByScore,
  rankByScore,
  settleRound,
  teamOutStatus,
} from '../scoring'
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

describe('rankByScore', () => {
  it('같은 점수는 같은 순위이고 다음 순위는 바로 이어진다(1-2-2-3) — 0점도 순위가 있다', () => {
    expect(rankByScore({ a: 40, b: 10, c: 10, d: 0, e: 30 })).toEqual({ a: 1, e: 2, b: 3, c: 3, d: 4 })
  })
})

describe('settleRound', () => {
  /**
   * 일반전 = 킬 10·3배 30 + 생존 5(탈락 모델 M3: 맞은 횟수가 라이프에 닿으면 아웃, 아웃은 보너스 없음).
   * 기획 §예시 라운드 1에서 A·B는 잡혀서(hits) 아웃, C만 생존이다.
   */
  it('팀 킬 ×10 + 생존 5를 팀원 전원에게 동일 지급하고 라운드 안 순위를 붙인다 — 기획 §예시 라운드 1', () => {
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
    // 최종 순위에 더하는 값은 원점수 그대로다(노션 ② "세 판 점수를 더해 우승자를 정해요")
    expect(settlement.playerPoints).toEqual(settlement.playerScores)
  })

  it('킬 없이 잡힌 팀은 원점수 0 — 킬 없이 살아남은 팀은 생존 5로 한 순위 위', () => {
    const settlement = settleRound(ledger({ tally: { A: { kills: 2, tripleKills: 0, kingKills: 0 } }, hits: { B: 1 } }))

    expect(settlement.teamScores).toEqual({ A: 25, B: 0, C: 5 })
    expect(settlement.playerTiers).toEqual({ 하늘: 1, 민재: 1, 준호: 3, 소율: 3, 서연: 2, 도윤: 2 })
    expect(settlement.playerPoints.준호).toBe(0)
    expect(settlement.playerPoints.서연).toBe(5)
  })

  it('판정이 하나도 없으면(tally null) 전원 생존 5', () => {
    const settlement = settleRound(ledger())

    expect(Object.values(settlement.teamScores)).toEqual([5, 5, 5])
    expect(Object.values(settlement.playerPoints)).toEqual([5, 5, 5, 5, 5, 5])
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
  it('원장의 모드가 가진 scoring으로 원점수를 낸다', () => {
    // 일반전은 생존 5가 붙고, 그룹전은 우리 팀 킬 + 그룹 점수(같은 그룹 킬 합)다 — A·B·C는 모두 다른 그룹
    const base = ledger({ tally: { A: { kills: 1, tripleKills: 0, kingKills: 0 } } })
    const asNormal = settleRound({ ...base, mode: 'normal' })
    const asGroup = settleRound({ ...base, mode: 'group' })

    expect(asNormal.teamScores).toEqual({ A: 15, B: 5, C: 5 })
    expect(asGroup.teamScores).toEqual({ A: 20, B: 0, C: 0 })
    expect(asGroup.playerPoints).toEqual({ 하늘: 20, 민재: 20, 준호: 0, 소율: 0, 서연: 0, 도윤: 0 })
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

  it('왕잡기는 왕이 잡힌 그룹 전원이 아웃이다 — 노션 ② "그룹 전체가 즉시 아웃"', () => {
    // A·E = 파랑(왕 A), B = 주황(왕 B), C = 초록
    const l = ledger({
      mode: 'king-hunt',
      teams: { A: ['하늘', '민재'], E: ['지우', '서우'], B: ['준호', '소율'], C: ['서연', '도윤'] },
      xTeams: ['A', 'B'],
      hits: { A: 1 },
    })

    expect(teamOutStatus(l)).toEqual({ A: true, E: true, B: false, C: false })
    expect(aliveTeamCount(l)).toBe(2)
    // 같은 원장이 다른 모드면 맞은 팀만 아웃이다
    expect(teamOutStatus({ ...l, mode: 'group' })).toEqual({ A: true, E: false, B: false, C: false })
  })
})

describe('groupByScore', () => {
  it('점수 높은 묶음부터 차례로 묶고 같은 점수는 uid 순이다', () => {
    const groups = groupByScore({
      teamScores: {},
      playerScores: { 서연: 40, 도윤: 40, 하늘: 10, 준호: 0, 민재: 0 },
      playerTiers: {},
      playerPoints: {},
    })

    expect(groups).toEqual([
      { score: 40, uids: ['도윤', '서연'] },
      { score: 10, uids: ['하늘'] },
      { score: 0, uids: ['민재', '준호'] },
    ])
  })

  it('정산할 사람이 없으면 빈 목록', () => {
    expect(groupByScore({ teamScores: {}, playerScores: {}, playerTiers: {}, playerPoints: {} })).toEqual([])
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

  it('라운드 원점수 합 내림차순 — 노션 ② "세 판 점수를 더해 우승자를 정해요"', () => {
    const standings = computeStandings([round2, round1])

    expect(standings.map((s) => [s.rank, s.uid, s.score])).toEqual([
      [1, '도윤', 50],
      [2, '서연', 40],
      [2, '하늘', 40],
      [4, '준호', 20],
      [5, '민재', 10],
    ])
  })

  it('등급 포인트 시절에 정산한 원장도 원점수(playerScores)로 더한다 — playerPoints는 읽지 않는다', () => {
    const [first] = computeStandings([round1])
    // round1의 playerPoints는 등급 포인트(서연 10)지만 원점수 40을 더한다
    expect(first).toMatchObject({ uid: '도윤', score: 40 })
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
      { roundNo: 1, score: 10 },
      { roundNo: 2, score: 30 },
    ])
    expect(standings.find((s) => s.uid === '신입')?.rounds).toEqual([{ roundNo: 3, score: 10 }])
  })

  it('점수 합이 같으면 공동 순위이고 다음 순위는 인원수만큼 건너뛴다', () => {
    const standings = computeStandings([
      ledger({
        roundNo: 1,
        result: {
          teamScores: {},
          playerScores: { 갑: 30, 을: 30, 병: 30, 정: 0 },
          playerTiers: {},
          playerPoints: {},
          finishedAtMs: 1,
        },
      }),
      ledger({
        roundNo: 2,
        result: {
          teamScores: {},
          playerScores: { 갑: 20, 을: 20, 병: 10, 정: 30 },
          playerTiers: {},
          playerPoints: {},
          finishedAtMs: 2,
        },
      }),
    ])

    expect(standings.map((s) => [s.rank, s.uid, s.score])).toEqual([
      [1, '갑', 50],
      [1, '을', 50],
      [3, '병', 40],
      [4, '정', 30],
    ])
  })

  it('정산이 없는(result null) 라운드는 무시하고, 라운드가 하나도 없으면 빈 목록', () => {
    expect(computeStandings([ledger({ roundNo: 1 })])).toEqual([])
    expect(computeStandings([])).toEqual([])
  })
})

describe('formatRoundScores', () => {
  it('라운드별 점수를 "1R 40점 · 2R 10점"으로 잇는다', () => {
    expect(formatRoundScores([{ roundNo: 1, score: 40 }, { roundNo: 2, score: 10 }])).toBe('1R 40점 · 2R 10점')
    expect(formatRoundScores([])).toBe('')
  })
})
