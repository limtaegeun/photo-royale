import { describe, it, expect } from 'vitest'
import {
  absorbKillEffect,
  applyTeamScale,
  distributeToPlayers,
  groupAssistScoreOf,
  groupScoring,
  isTeamOut,
  killCountOf,
  killScoreOf,
  killScoring,
  kingHuntKillScoreOf,
  kingHuntScoring,
  livesOf,
  normalScoring,
  staffChaseScoring,
  tailChaseScoring,
  teamScaleOf,
} from '../scoring'
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

describe('그룹전 (P07 §4.3)', () => {
  /** A·E = 파랑 그룹, B = 주황, C = 초록 — 그룹 동료가 있는 팀은 A·E뿐 */
  const GROUP_TEAMS = { A: ['하늘', '민재'], E: ['지우'], B: ['준호'], C: ['서연', '도윤'] }

  it('killCountOf는 배율과 무관한 킬 건수다', () => {
    expect(killCountOf({ A: { kills: 2, tripleKills: 1 } }, 'A')).toBe(3)
    expect(killCountOf({}, 'A')).toBe(0)
  })

  it('그룹 동료 킬은 같은 그룹 다른 팀의 킬 건수 × 5 — 자기 킬과 다른 그룹 킬은 세지 않는다', () => {
    const tally = { A: { kills: 2, tripleKills: 0 }, E: { kills: 1, tripleKills: 0 }, B: { kills: 3, tripleKills: 0 } }
    expect(groupAssistScoreOf({ teams: GROUP_TEAMS, tally }, 'A')).toBe(5)
    expect(groupAssistScoreOf({ teams: GROUP_TEAMS, tally }, 'E')).toBe(10)
    expect(groupAssistScoreOf({ teams: GROUP_TEAMS, tally }, 'B')).toBe(0)
    expect(groupAssistScoreOf({ teams: GROUP_TEAMS, tally }, 'C')).toBe(0)
  })

  it('내 킬 10 + 동료 킬 5를 팀원 각자에게 — 직접 킬한 팀이 동료보다 위, 생존 보너스는 없다', () => {
    const output = groupScoring({
      teams: GROUP_TEAMS,
      xTeams: [],
      tally: { A: { kills: 2, tripleKills: 0 } },
      hits: { B: 1 },
    })

    // A 20(내 킬 2건) · E 20(동료 킬 2건 × 5 = 10, 1인 팀 2배) · B 0(아웃이어도 감점 없음) · C 0(생존해도 보너스 없음)
    expect(output.teamScores).toEqual({ A: 20, E: 20, B: 0, C: 0 })
    expect(output.playerScores).toEqual({ 하늘: 20, 민재: 20, 지우: 20, 준호: 0, 서연: 0, 도윤: 0 })
  })

  it('레지스트리의 그룹전 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES.group.scoring).toBe(groupScoring)
  })
})


describe('왕잡기 (P07 §4.4)', () => {
  /** A·E = 파랑(왕 A), B·F = 주황(왕 F, 1인 팀), C = 초록(왕 C), D = 빨강(왕 D) */
  const KH_TEAMS = { A: ['하늘', '민재'], E: ['지우'], B: ['준호', '유나'], F: ['서준'], C: ['서연', '도윤'], D: ['하준', '수아'] }
  const KINGS = ['A', 'C', 'D', 'F']

  it('킬 원점수: 일반 팀 10 · 왕 20 · 왕 사냥 30, 왕 사냥 건수는 킬 건수를 넘지 못한다', () => {
    const tally = {
      B: { kills: 2, tripleKills: 0, kingKills: 1 }, // 일반 팀: 왕 사냥 1 + 일반 1
      A: { kills: 1, tripleKills: 0, kingKills: 0 }, // 왕의 일반 킬
      C: { kills: 1, tripleKills: 0, kingKills: 1 }, // 왕이 왕을 잡음 → 30
      D: { kills: 0, tripleKills: 0, kingKills: 3 }, // 손상 데이터 — 건수 상한
    }
    expect(kingHuntKillScoreOf({ tally, xTeams: KINGS }, 'B')).toBe(40)
    expect(kingHuntKillScoreOf({ tally, xTeams: KINGS }, 'A')).toBe(20)
    expect(kingHuntKillScoreOf({ tally, xTeams: KINGS }, 'C')).toBe(30)
    expect(kingHuntKillScoreOf({ tally, xTeams: KINGS }, 'D')).toBe(0)
    expect(kingHuntKillScoreOf({ tally, xTeams: KINGS }, 'E')).toBe(0)
  })

  it('kingKills가 없는 옛 집계는 전부 일반 킬로 센다', () => {
    expect(kingHuntKillScoreOf({ tally: { B: { kills: 2, tripleKills: 0 } }, xTeams: KINGS }, 'B')).toBe(20)
  })

  it('잡힌 왕의 그룹 전원(왕 팀 포함)이 −20, 그룹 동료 킬 5, 생존 보너스 없음, 1인 팀 2배', () => {
    // B(주황)가 파랑 왕 A를 잡았다(왕 아웃) · A는 잡히기 전 B를 한 번 잡았다(왕의 킬, B는 왕이 아니라 감점 없음)
    const output = kingHuntScoring({
      teams: KH_TEAMS,
      xTeams: KINGS,
      tally: { B: { kills: 1, tripleKills: 0, kingKills: 1 }, A: { kills: 1, tripleKills: 0, kingKills: 0 } },
      hits: { A: 1, B: 1 },
    })

    expect(output.teamScores).toEqual({
      A: 0, // 왕의 킬 20 − 왕 아웃 20
      E: -30, // 동료(A) 킬 1 × 5 − 20 = −15, 1인 팀 2배
      B: 30, // 왕 사냥 30 — 잡혔지만 왕이 아니라 감점 없음
      F: 10, // 동료(B) 킬 1 × 5, 1인 팀 2배
      C: 0, // 생존해도 보너스 없음
      D: 0,
    })
    expect(output.playerScores).toEqual({ 하늘: 0, 민재: 0, 지우: -30, 준호: 30, 유나: 30, 서준: 10, 서연: 0, 도윤: 0, 하준: 0, 수아: 0 })
  })

  it('왕 아웃은 라이프를 다 써야 한다 — 1인 팀 왕은 한 번 맞아도 감점이 없다', () => {
    const output = kingHuntScoring({ teams: KH_TEAMS, xTeams: KINGS, tally: {}, hits: { F: 1 } })
    expect(output.teamScores.B).toBe(0)
    expect(output.teamScores.F).toBe(0)
    const out = kingHuntScoring({ teams: KH_TEAMS, xTeams: KINGS, tally: {}, hits: { F: 2 } })
    expect(out.teamScores.B).toBe(-20)
    expect(out.teamScores.F).toBe(-40)
  })

  it('레지스트리의 왕잡기 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES['king-hunt'].scoring).toBe(kingHuntScoring)
  })
})

describe('스태프 추격전 (P07 §4.5)', () => {
  /** A·B는 2인 팀(라이프 1), C는 1인 팀(라이프 2) */
  const SC_TEAMS = { A: ['u1', 'u2'], B: ['u3', 'u4'], C: ['u5'] }

  it('생존 팀은 15, 아웃 팀은 5를 팀원 각자에게 — 1인 팀도 2배로 뻥튀기하지 않는다', () => {
    const output = staffChaseScoring({
      teams: SC_TEAMS,
      xTeams: [],
      tally: {},
      hits: { B: 1, C: 1 },
    })

    // B는 아웃(hits 1 ≥ 라이프 1) · C는 아직 생존(hits 1 < 라이프 2, 1인 팀이라도 2배 없이 15 그대로)
    expect(output.teamScores).toEqual({ A: 15, B: 5, C: 15 })
    expect(output.playerScores).toEqual({ u1: 15, u2: 15, u3: 5, u4: 5, u5: 15 })
  })

  it('1인 팀도 라이프를 다 써야 아웃이다', () => {
    const output = staffChaseScoring({ teams: SC_TEAMS, xTeams: [], tally: {}, hits: { C: 2 } })

    expect(output.teamScores.C).toBe(5)
    expect(output.playerScores.u5).toBe(5)
  })

  it('참가자 전원이 동맹이라 킬 집계는 무시한다', () => {
    const output = staffChaseScoring({
      teams: SC_TEAMS,
      xTeams: [],
      tally: { A: { kills: 5, tripleKills: 2 } },
      hits: {},
    })

    // 킬을 아무리 올려도 생존 15 그대로 — 등급은 hits(스태프 아웃 기록)로만 갈린다
    expect(output.teamScores).toEqual({ A: 15, B: 15, C: 15 })
  })

  it('레지스트리의 스태프 추격전 정의가 이 규칙을 쓴다', () => {
    expect(GAME_MODES['staff-chase'].scoring).toBe(staffChaseScoring)
  })
})
