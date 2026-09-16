import { describe, it, expect } from 'vitest'
import { applyTeamScale, distributeToPlayers, isTeamOut, killScoreOf, killScoring, livesOf, normalScoring, teamScaleOf } from '../scoring'
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
