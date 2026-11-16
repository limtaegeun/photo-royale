import { describe, it, expect } from 'vitest'
import {
  absorbKillEffect,
  applyTeamScale,
  distributeToPlayers,
  groupKillScoreOf,
  groupScoring,
  isKingDownInGroup,
  isTeamOut,
  killCountOf,
  killScoreOf,
  killScoring,
  kingHuntScoring,
  kingHuntsOf,
  livesOf,
  normalScoring,
  staffChaseHeadcount,
  staffChaseScoring,
  tailChaseScoring,
  teamScaleOf,
} from '../scoring'
import { isTeamEliminated } from '../elimination'
import { GAME_MODES } from '../registry'

const TEAMS = { A: ['하늘', '민재'], B: ['준호'], C: ['서연', '도윤'] }

describe('killScoreOf', () => {
  it('일반 킬 10 + 낙오 3배 킬 30, 집계가 없는 완장은 0', () => {
    const tally = { A: { kills: 2, tripleKills: 1 } }
    expect(killScoreOf(tally, 'A')).toBe(50)
    expect(killScoreOf(tally, 'B')).toBe(0)
  })
})

describe('distributeToPlayers', () => {
  it('팀 원점수를 팀원 전원에게 동일 지급하고 스냅샷 밖 uid는 넣지 않는다', () => {
    expect(distributeToPlayers(TEAMS, { A: 10, C: 40, Z: 99 })).toEqual({
      하늘: 10,
      민재: 10,
      준호: 0,
      서연: 40,
      도윤: 40,
    })
  })
})

describe('killScoring (기본 킬 규칙)', () => {
  it('완장마다 킬 원점수를 내고 팀원에게 귀속한다 — 기획 §예시 라운드 1', () => {
    const output = killScoring({
      teams: TEAMS,
      xTeams: [],
      tally: { C: { kills: 1, tripleKills: 1 }, A: { kills: 1, tripleKills: 0 } },
      hits: { A: 1, B: 1 },
    })

    expect(output.teamScores).toEqual({ A: 10, B: 0, C: 40 })
    expect(output.playerScores).toEqual({ 하늘: 10, 민재: 10, 준호: 0, 서연: 40, 도윤: 40 })
  })

  it('모든 모드 정의가 scoring 함수를 갖는다 — 원장의 어떤 모드 문서도 정산이 가능해야 한다', () => {
    for (const mode of Object.values(GAME_MODES)) {
      expect(typeof mode.scoring).toBe('function')
      const output = mode.scoring({ teams: TEAMS, xTeams: [], tally: {}, hits: {} })
      expect(Object.keys(output.playerScores).sort()).toEqual(['도윤', '민재', '서연', '준호', '하늘'])
    }
  })
})

describe('탈락 모델 (P07 M3)', () => {
  it('라이프는 2인 팀 1, 1인 팀 2', () => {
    expect(livesOf(TEAMS, 'A')).toBe(1)
    expect(livesOf(TEAMS, 'B')).toBe(2)
    expect(livesOf(TEAMS, 'Z')).toBe(1)
  })

  it('아웃 = hits가 라이프에 닿음 — 경계 포함', () => {
    expect(isTeamOut({ teams: TEAMS, hits: {} }, 'A')).toBe(false)
    expect(isTeamOut({ teams: TEAMS, hits: { A: 1 } }, 'A')).toBe(true)
    expect(isTeamOut({ teams: TEAMS, hits: { B: 1 } }, 'B')).toBe(false)
    expect(isTeamOut({ teams: TEAMS, hits: { B: 2 } }, 'B')).toBe(true)
  })

  it('normalScoring = 킬 + 생존 5(아웃 제외) — 3배 킬과도 합산되고 1인 팀은 2배', () => {
    const output = normalScoring({
      teams: TEAMS,
      xTeams: [],
      tally: { C: { kills: 0, tripleKills: 1 } },
      hits: { A: 1 },
    })

    // B(준호)는 1인 팀 — 생존 5 × 2 = 10
    expect(output.teamScores).toEqual({ A: 0, B: 10, C: 35 })
    expect(output.playerScores).toEqual({ 하늘: 0, 민재: 0, 준호: 10, 서연: 35, 도윤: 35 })
  })
})

describe('1인 팀 보정 (규칙서: 목숨과 포인트가 2배)', () => {
  it('팀 원점수 배율은 1인 팀 2, 2인 팀 1', () => {
    expect(teamScaleOf(TEAMS, 'A')).toBe(1)
    expect(teamScaleOf(TEAMS, 'B')).toBe(2)
    expect(applyTeamScale(TEAMS, { A: 10, B: 10, C: 0 })).toEqual({ A: 10, B: 20, C: 0 })
  })

  it('기본 킬 규칙도 1인 팀 킬은 2배로 센다', () => {
    const output = killScoring({ teams: TEAMS, xTeams: [], tally: { B: { kills: 1, tripleKills: 1 } }, hits: {} })

    expect(output.teamScores.B).toBe(80)
    expect(output.playerScores.준호).toBe(80)
  })

  it('감점은 2배로 불리지 않는다 — 음수·0 원점수는 그대로', () => {
    const teams = { A: ['u1'], B: ['u2', 'u3'] }

    expect(applyTeamScale(teams, { A: -20, B: -20 })).toEqual({ A: -20, B: -20 })
    expect(applyTeamScale(teams, { A: 0 })).toEqual({ A: 0 })
    expect(applyTeamScale(teams, { A: 5 })).toEqual({ A: 10 })
  })
})

describe('꼬리잡기 (P07 §4.2)', () => {
  it('킬 10 + 생존 5(아웃 제외)를 팀원 각자에게 — 1인 팀은 2배', () => {
    const teams = { A: ['u1', 'u2'], B: ['u3', 'u4'], C: ['u5'] }
    const output = tailChaseScoring({
      teams,
      xTeams: [],
      tally: { A: { kills: 1, tripleKills: 0 } },
      hits: { B: 1 },
    })

    // B는 아웃(hits 1 ≥ 라이프 1)이라 생존 보너스가 없다 · C는 1인 팀이라 생존 5 × 2 = 10
    expect(output.teamScores).toEqual({ A: 15, B: 0, C: 10 })
    expect(output.playerScores).toEqual({ u1: 15, u2: 15, u3: 0, u4: 0, u5: 10 })
  })

  it('레지스트리의 꼬리잡기 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES['tail-chase'].scoring).toBe(tailChaseScoring)
  })
})

describe('꼬리잡기 편입 (P07 §4.2, M4-6)', () => {
  /** A(a1·a2)·B(b1·b2)·C(c1·c2)는 2인 팀(라이프 1), D(d1)는 1인 팀(라이프 2) */
  const TC_TEAMS = { A: ['a1', 'a2'], B: ['b1', 'b2'], C: ['c1', 'c2'], D: ['d1'] }

  describe('absorbKillEffect — 킬 1건이 원장에 남길 것', () => {
    it('크레딧은 공격 팀원 + 이미 그 팀 꼬리로 편입된 인원 — 같은 uid는 한 번만', () => {
      const effect = absorbKillEffect(
        { teams: TC_TEAMS, hits: {}, tails: { A: ['b1', 'b2', 'a2'] } },
        'A',
        'C',
      )

      expect(effect.creditUids).toEqual(['a1', 'a2', 'b1', 'b2'])
      // 자기 꼬리에 든 팀원(손상 데이터)은 편입처가 아니다
      expect(effect.absorbedIntoTeams).toEqual([])
    })

    it('2인 팀은 첫 히트로 아웃 — 팀원과 그 팀이 끌던 꼬리가 잡은 팀에 합류한다(이 킬의 크레딧은 못 받는다)', () => {
      const effect = absorbKillEffect(
        { teams: TC_TEAMS, hits: {}, tails: { B: ['c1', 'c2'] } },
        'A',
        'B',
      )

      expect(effect.creditUids).toEqual(['a1', 'a2'])
      expect(effect.absorbedUids).toEqual(['b1', 'b2', 'c1', 'c2'])
    })

    it('1인 팀은 라이프 2라 첫 히트로는 합류하지 않고 두 번째 히트로 합류한다', () => {
      expect(absorbKillEffect({ teams: TC_TEAMS, hits: {} }, 'C', 'D').absorbedUids).toEqual([])
      expect(absorbKillEffect({ teams: TC_TEAMS, hits: { D: 1 } }, 'C', 'D').absorbedUids).toEqual(['d1'])
    })

    it('tails가 없는 원장(첫 아웃 전)은 팀원만으로 계산한다', () => {
      expect(absorbKillEffect({ teams: TC_TEAMS, hits: {} }, 'A', 'B')).toEqual({
        creditUids: ['a1', 'a2'],
        absorbedUids: ['b1', 'b2'],
        absorbedIntoTeams: [],
      })
    })

    /**
     * 10/9 리허설 문제 6 — A→B 사진을 먼저 인정하고 B→C 사진(B가 잡히기 전에 찍은 것)을 나중에 인정하면
     * C 두 명이 이미 탈락한 B의 꼬리에만 남아 그 뒤 A의 킬 크레딧을 못 받았다(판정 순서가 반대면 10점).
     */
    it('공격 팀이 이미 잡혀 편입된 뒤의 킬이면 공격 팀원을 꼬리에 끌고 있는 완장을 absorbedIntoTeams로 돌려준다', () => {
      const effect = absorbKillEffect(
        { teams: TC_TEAMS, hits: { B: 1 }, tails: { A: ['b1', 'b2'] } },
        'B',
        'C',
      )

      // 크레딧은 여전히 B 몫(찍을 때 살아 있었다), 합류 인원은 B 꼬리와 함께 A 꼬리에도 간다
      expect(effect).toEqual({
        creditUids: ['b1', 'b2'],
        absorbedUids: ['c1', 'c2'],
        absorbedIntoTeams: ['A'],
      })
    })

    it('편입이 연쇄됐으면(A가 B를 잡은 뒤 D가 A를 잡음) B 팀원을 끌고 있는 A·D 모두가 편입처다', () => {
      const ledger = {
        teams: TC_TEAMS,
        hits: { A: 1, B: 1 },
        tails: { A: ['b1', 'b2'], D: ['a1', 'a2', 'b1', 'b2'] },
      }

      expect(absorbKillEffect(ledger, 'B', 'C').absorbedIntoTeams).toEqual(['A', 'D'])
      expect(absorbKillEffect(ledger, 'A', 'C').absorbedIntoTeams).toEqual(['D'])
    })
  })

  describe('판정 순서와 원장 (10/9 리허설 문제 6)', () => {
    /** 2인 팀 4개 — A→B→C→D→A 순으로 사냥한다 */
    const RING_TEAMS = { A: ['a1', 'a2'], B: ['b1', 'b2'], C: ['c1', 'c2'], D: ['d1', 'd2'] }
    interface Ledger {
      hits: Record<string, number>
      tails: Record<string, string[]>
      credits: Record<string, number>
    }
    const EMPTY_LEDGER: Ledger = { hits: {}, tails: {}, credits: {} }

    /** 판정 배치(round-ledger addTallyToBatch)가 원장에 남기는 것을 메모리에서 그대로 — credits increment, tails arrayUnion */
    function judge(ledger: Ledger, attacker: string, target: string): Ledger {
      const effect = absorbKillEffect(
        { teams: RING_TEAMS, hits: ledger.hits, tails: ledger.tails },
        attacker,
        target,
      )
      const hits = { ...ledger.hits, [target]: (ledger.hits[target] ?? 0) + 1 }
      const credits = { ...ledger.credits }
      for (const uid of effect.creditUids) credits[uid] = (credits[uid] ?? 0) + 1
      const tails = { ...ledger.tails }
      if (effect.absorbedUids.length > 0) {
        for (const armband of [attacker, ...effect.absorbedIntoTeams]) {
          tails[armband] = [...new Set([...(tails[armband] ?? []), ...effect.absorbedUids])]
        }
      }
      return { hits, tails, credits }
    }

    it('A→B 사진을 먼저 인정해도 B→C 먼저와 원장이 같다 — C 두 명이 그 뒤 A→D 킬의 크레딧을 받는다', () => {
      // B→C 사진은 B가 A에게 잡히기 전에 찍혀 A→B 사진과 함께 판정을 기다리던 것
      const natural = judge(judge(judge(EMPTY_LEDGER, 'B', 'C'), 'A', 'B'), 'A', 'D')
      const reversed = judge(judge(judge(EMPTY_LEDGER, 'A', 'B'), 'B', 'C'), 'A', 'D')

      expect(reversed).toEqual(natural)
      expect(reversed.tails.A).toEqual(['b1', 'b2', 'c1', 'c2', 'd1', 'd2'])
      expect(reversed.credits).toEqual({ a1: 2, a2: 2, b1: 2, b2: 2, c1: 1, c2: 1 })
    })

    it('정산도 같다 — 개인 원점수 A 25 · B 20 · C 10 · D 0', () => {
      const ledger = judge(judge(judge(EMPTY_LEDGER, 'A', 'B'), 'B', 'C'), 'A', 'D')
      const output = tailChaseScoring({
        teams: RING_TEAMS,
        xTeams: [],
        tally: { A: { kills: 2, tripleKills: 0 }, B: { kills: 1, tripleKills: 0 } },
        hits: ledger.hits,
        credits: ledger.credits,
      })

      expect(output.playerScores).toEqual({
        a1: 25,
        a2: 25,
        b1: 20,
        b2: 20,
        c1: 10,
        c2: 10,
        d1: 0,
        d2: 0,
      })
    })
  })

  describe('tailChaseScoring — 크레딧 귀속', () => {
    /**
     * A가 B를 잡고(B 합류) → A가 C를 잡고(a1·a2·b1·b2 크레딧, C 합류) → D가 A를 잡았다(A 아웃).
     * 크레딧: a1·a2 = 2, b1·b2 = 1(편입 뒤 킬 1건), c1·c2 = 0(편입 뒤 킬 없음), d1 = 1.
     */
    const input = {
      teams: TC_TEAMS,
      xTeams: [],
      tally: { A: { kills: 2, tripleKills: 0 }, D: { kills: 1, tripleKills: 0 } },
      hits: { B: 1, C: 1, A: 1 },
    }
    const credits = { a1: 2, a2: 2, b1: 1, b2: 1, d1: 1 }

    it('개인 원점수 = 내 크레딧 × 10 + 원래 완장의 생존 5 — 편입자는 팀원과 달라진다(결정 9), 1인 팀 2배', () => {
      const output = tailChaseScoring({ ...input, credits })

      // a1·a2: 킬 2건 20, A는 잡혀서 생존 없음 · b1·b2: 편입 뒤 킬 1건 10, B 아웃 · c1·c2: 0
      // d1: 킬 1건 10 + 생존 5 = 15, 1인 팀 2배 = 30
      expect(output.playerScores).toEqual({ a1: 20, a2: 20, b1: 10, b2: 10, c1: 0, c2: 0, d1: 30 })
    })

    it('팀 원점수는 크레딧과 무관하게 공격 완장의 tally 기준 그대로다', () => {
      expect(tailChaseScoring({ ...input, credits }).teamScores).toEqual({ A: 20, B: 0, C: 0, D: 30 })
      expect(tailChaseScoring({ ...input, credits }).teamScores).toEqual(tailChaseScoring(input).teamScores)
    })

    it('credits가 없는 원장(편입 도입 전 문서)은 팀 원점수 동일 지급이다', () => {
      expect(tailChaseScoring(input).playerScores).toEqual({
        a1: 20,
        a2: 20,
        b1: 0,
        b2: 0,
        c1: 0,
        c2: 0,
        d1: 30,
      })
    })

    it('편성 스냅샷 밖 uid의 크레딧은 결과에 넣지 않는다 — 그 라운드 미참가(결정 11)', () => {
      const output = tailChaseScoring({ ...input, credits: { ...credits, ghost: 5 } })

      expect(output.playerScores).not.toHaveProperty('ghost')
    })

    it('레지스트리의 꼬리잡기만 편입 모드다 — 판정 배치가 tails·credits를 쓰는 근거', () => {
      const absorbing = Object.values(GAME_MODES)
        .filter((mode) => mode.absorbsCaughtTeam === true)
        .map((mode) => mode.id)

      expect(absorbing).toEqual(['tail-chase'])
    })
  })
})

describe('그룹전 (노션 ② 그룹전 카드)', () => {
  /** A·E = 파랑 그룹, B = 주황, C = 초록 — 그룹 동료가 있는 팀은 A·E뿐 */
  const GROUP_TEAMS = { A: ['하늘', '민재'], E: ['지우'], B: ['준호'], C: ['서연', '도윤'] }

  it('killCountOf는 배율과 무관한 킬 건수다', () => {
    expect(killCountOf({ A: { kills: 2, tripleKills: 1 } }, 'A')).toBe(3)
    expect(killCountOf({}, 'A')).toBe(0)
  })

  it('그룹 점수는 같은 그룹 모든 팀(우리 팀 포함)의 킬 원점수 합 — 다른 그룹 킬은 세지 않는다', () => {
    const tally = { A: { kills: 2, tripleKills: 0 }, E: { kills: 1, tripleKills: 0 }, B: { kills: 3, tripleKills: 0 } }
    expect(groupKillScoreOf({ teams: GROUP_TEAMS, tally }, 'A')).toBe(30)
    expect(groupKillScoreOf({ teams: GROUP_TEAMS, tally }, 'E')).toBe(30)
    expect(groupKillScoreOf({ teams: GROUP_TEAMS, tally }, 'B')).toBe(30)
    expect(groupKillScoreOf({ teams: GROUP_TEAMS, tally }, 'C')).toBe(0)
  })

  it('"그룹이 함께 번 점수와 우리 팀 점수를 더해서" — 우리 팀 킬 20, 같은 그룹 다른 팀 킬 10, 생존 보너스는 없다', () => {
    const output = groupScoring({
      teams: GROUP_TEAMS,
      xTeams: [],
      tally: { A: { kills: 2, tripleKills: 0 } },
      hits: { B: 1 },
    })

    // A 40(우리 팀 20 + 그룹 20) · E 40(그룹 20, 1인 팀 2배) · B 0(아웃이어도 감점 없음) · C 0(생존해도 보너스 없음)
    expect(output.teamScores).toEqual({ A: 40, E: 40, B: 0, C: 0 })
    expect(output.playerScores).toEqual({ 하늘: 40, 민재: 40, 지우: 40, 준호: 0, 서연: 0, 도윤: 0 })
  })

  it('레지스트리의 그룹전 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES.group.scoring).toBe(groupScoring)
  })
})

describe('왕잡기 (2026-11-16 기획 변경 — 왕만 점수)', () => {
  /** A·E = 파랑(왕 A), B·F = 주황(왕 F, 1인 팀), C = 초록(왕 C), D = 빨강(왕 D) */
  const KH_TEAMS = { A: ['하늘', '민재'], E: ['지우'], B: ['준호', '유나'], F: ['서준'], C: ['서연', '도윤'], D: ['하준', '수아'] }
  const KINGS = ['A', 'C', 'D', 'F']

  it('잡은 왕 수는 왕을 아웃시킨 킬만 세고 킬 건수를 넘지 못한다 — kingKills가 없는 옛 집계는 0', () => {
    const tally = {
      B: { kills: 2, tripleKills: 0, kingKills: 1 },
      C: { kills: 0, tripleKills: 1, kingKills: 1 }, // 낙오 킬로 잡아도 왕 잡기다
      D: { kills: 0, tripleKills: 0, kingKills: 3 }, // 손상 데이터 — 건수 상한
    }
    expect(kingHuntsOf(tally, 'B')).toBe(1)
    expect(kingHuntsOf(tally, 'C')).toBe(1)
    expect(kingHuntsOf(tally, 'D')).toBe(0)
    expect(kingHuntsOf(tally, 'E')).toBe(0)
    expect(kingHuntsOf({ B: { kills: 2, tripleKills: 0 } }, 'B')).toBe(0)
  })

  it('왕이 아닌 팀을 잡은 킬샷은 일반·낙오 킬 모두 0점이다', () => {
    const output = kingHuntScoring({
      teams: KH_TEAMS,
      xTeams: KINGS,
      tally: { B: { kills: 2, tripleKills: 1, kingKills: 0 } },
      hits: { C: 1, E: 1 },
    })

    expect(Object.values(output.teamScores).every((score) => score === 0)).toBe(true)
    expect(Object.values(output.playerScores).every((score) => score === 0)).toBe(true)
  })

  it('왕을 잡으면 찍은 사람 개인 +30 · 잡은 팀 +10 — 짝꿍은 10, 같은 그룹 다른 팀은 0, 왕이 잡힌 그룹은 감점 없음', () => {
    // B(주황)의 유나가 파랑 왕 A를 잡았다(왕 아웃) · A는 잡히기 전 B를 한 번 잡았다(왕이 아닌 킬 0)
    const output = kingHuntScoring({
      teams: KH_TEAMS,
      xTeams: KINGS,
      tally: { B: { kills: 1, tripleKills: 0, kingKills: 1 }, A: { kills: 1, tripleKills: 0, kingKills: 0 } },
      hits: { A: 1, B: 1 },
      credits: { 유나: 1 },
    })

    // 팀 원점수는 팀 점수만이다
    expect(output.teamScores).toEqual({ A: 0, E: 0, B: 10, F: 0, C: 0, D: 0 })
    expect(output.playerScores).toEqual({
      하늘: 0,
      민재: 0,
      지우: 0,
      준호: 10, // 짝꿍 — 팀 점수만
      유나: 40, // 찍은 사람 — 개인 30 + 팀 10
      서준: 0, // 같은 그룹이어도 다른 팀은 받지 않는다
      서연: 0,
      도윤: 0,
      하준: 0,
      수아: 0,
    })
  })

  it('1인 팀이 왕을 잡으면 개인·팀 점수가 모두 2배다', () => {
    const output = kingHuntScoring({
      teams: KH_TEAMS,
      xTeams: KINGS,
      tally: { F: { kills: 1, tripleKills: 0, kingKills: 1 } },
      hits: { C: 1 },
      credits: { 서준: 1 },
    })

    expect(output.teamScores.F).toBe(20)
    expect(output.playerScores.서준).toBe(80)
  })

  it('찍은 사람을 남기기 전 원장(credits 없음)은 팀원 전원에게 개인 30을 준다', () => {
    const output = kingHuntScoring({
      teams: KH_TEAMS,
      xTeams: KINGS,
      tally: { B: { kills: 1, tripleKills: 0, kingKills: 1 } },
      hits: { A: 1 },
    })

    expect(output.playerScores.준호).toBe(40)
    expect(output.playerScores.유나).toBe(40)
  })

  it('"우리 왕이 잡히면 그 판은 그룹 전체가 즉시 아웃" — 같은 그룹 왕이 아웃이면 그 그룹 팀도 아웃이다', () => {
    const input = { teams: KH_TEAMS, xTeams: KINGS, hits: { A: 1 } }
    expect(isKingDownInGroup(input, 'E')).toBe(true)
    expect(isKingDownInGroup(input, 'A')).toBe(true)
    expect(isKingDownInGroup(input, 'B')).toBe(false)
    expect(isTeamEliminated('king-hunt', input, 'E')).toBe(true)
    expect(isTeamEliminated('king-hunt', input, 'B')).toBe(false)
    // 비밀 왕이 없는 모드는 같은 편성이어도 그룹 탈락이 없다
    expect(isTeamEliminated('group', input, 'E')).toBe(false)
    expect(isTeamEliminated('normal', input, 'E')).toBe(false)
  })

  it('왕 아웃은 라이프를 다 써야 한다 — 1인 팀 왕은 한 번 맞아도 그룹이 아웃되지 않는다', () => {
    expect(isTeamEliminated('king-hunt', { teams: KH_TEAMS, xTeams: KINGS, hits: { F: 1 } }, 'B')).toBe(false)
    expect(isTeamEliminated('king-hunt', { teams: KH_TEAMS, xTeams: KINGS, hits: { F: 2 } }, 'B')).toBe(true)
  })

  it('레지스트리의 왕잡기 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES['king-hunt'].scoring).toBe(kingHuntScoring)
  })
})

describe('스태프 추격전 (노션 ② 스태프 추격전 카드)', () => {
  /** A·B는 2인 팀(라이프 1), C는 1인 팀(라이프 2) — 참가자 5명 */
  const SC_TEAMS = { A: ['u1', 'u2'], B: ['u3', 'u4'], C: ['u5'] }

  it('생존자 = 아웃 아닌 팀의 팀원', () => {
    expect(staffChaseHeadcount({ teams: SC_TEAMS, hits: {} })).toEqual({ survivors: 5, participants: 5 })
    expect(staffChaseHeadcount({ teams: SC_TEAMS, hits: { B: 1, C: 1 } })).toEqual({ survivors: 3, participants: 5 })
    expect(staffChaseHeadcount({ teams: SC_TEAMS, hits: { B: 1, C: 2 } })).toEqual({ survivors: 2, participants: 5 })
  })

  it('"살아남은 사람이 많을수록 모두의 점수가 올라가요" — 생존 비율 × 10을 잡힌 사람까지 모두 같게, 1인 팀 2배', () => {
    const output = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: { B: 1, C: 1 } })

    // 5명 중 3명 생존 → round(10 × 3/5) = 6. B는 잡혔지만 같은 6, C는 1인 팀이라 12
    expect(output.teamScores).toEqual({ A: 6, B: 6, C: 12 })
    expect(output.playerScores).toEqual({ u1: 6, u2: 6, u3: 6, u4: 6, u5: 12 })
  })

  it('생존자가 늘면 모두의 점수가 함께 오른다 — 전원 생존이면 모두 10', () => {
    const fewer = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: { A: 1, B: 1 } })
    const more = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: { A: 1 } })
    const all = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: {} })
    expect(fewer.teamScores.A).toBe(2) // 1/5
    expect(more.teamScores.A).toBe(6) // 3/5
    expect(all.teamScores).toEqual({ A: 10, B: 10, C: 20 })
  })

  it('전원 잡히면 모두 0', () => {
    const output = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: { A: 1, B: 1, C: 2 } })
    expect(output.teamScores).toEqual({ A: 0, B: 0, C: 0 })
  })

  it('참가자 전원이 동맹이라 킬 집계는 무시한다', () => {
    const output = staffChaseScoring({
      teams: SC_TEAMS,
      xTeams: [],
      tally: { A: { kills: 5, tripleKills: 2 } },
      hits: {},
    })
    expect(output.teamScores).toEqual({ A: 10, B: 10, C: 20 })
  })

  it('레지스트리의 스태프 추격전 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES['staff-chase'].scoring).toBe(staffChaseScoring)
  })
})
