import { describe, expect, it, vi } from 'vitest'
import type { RoundLedger } from '@/features/round-ledger'

// 사슬 계산은 순수 함수지만 round-ledger 배럴이 api/rounds를 함께 내보낸다 — 실제 firebase 초기화만 막는다
vi.mock('@/shared/api/firebase', () => ({ db: {}, auth: {} }))

import { deriveTailChaseObjective } from '../tailChaseObjective'

const TEAMS = {
  A: ['a1', 'a2'],
  B: ['b1', 'b2'],
  C: ['c1', 'c2'],
  D: ['d1', 'd2'],
  E: ['e1', 'e2'],
}

function ledger(overrides: Partial<RoundLedger> = {}): RoundLedger {
  return {
    roundNo: 1,
    mode: 'tail-chase',
    teams: TEAMS,
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

describe('deriveTailChaseObjective', () => {
  it('기본 — 앞 완장이 쫓고 다음 완장을 잡는다', () => {
    expect(deriveTailChaseObjective(ledger(), 'B', 'b1')).toEqual({
      role: 'hunter',
      team: 'B',
      chaser: 'A',
      prey: 'C',
      preyLivesLeft: null,
      tailCount: 0,
    })
  })

  it('마지막 완장은 첫 완장을 잡고, 첫 완장은 마지막 완장에게 쫓긴다', () => {
    expect(deriveTailChaseObjective(ledger(), 'E', 'e1')).toMatchObject({ chaser: 'D', prey: 'A' })
    expect(deriveTailChaseObjective(ledger(), 'A', 'a1')).toMatchObject({ chaser: 'E', prey: 'B' })
  })

  it('잡은 직후 — 잡힌 팀의 먹이가 새 목표가 되고 꼬리 인원이 늘어난다', () => {
    const caught = ledger({ hits: { C: 1 }, tails: { B: ['c1', 'c2'] } })
    expect(deriveTailChaseObjective(caught, 'B', 'b1')).toMatchObject({
      prey: 'D',
      preyLivesLeft: null,
      tailCount: 2,
    })
  })

  it('1인 팀을 한 번 잡으면 목표는 그대로고 남은 목숨을 알려 준다', () => {
    const solo = ledger({ teams: { ...TEAMS, C: ['c1'] }, hits: { C: 1 } })
    expect(deriveTailChaseObjective(solo, 'B', 'b1')).toMatchObject({ prey: 'C', preyLivesLeft: 1 })
  })

  it('1인 팀을 두 번 잡으면 다음 팀이 목표가 된다', () => {
    const solo = ledger({
      teams: { ...TEAMS, C: ['c1'] },
      hits: { C: 2 },
      tails: { B: ['c1'] },
    })
    expect(deriveTailChaseObjective(solo, 'B', 'b1')).toMatchObject({
      prey: 'D',
      preyLivesLeft: null,
      tailCount: 1,
    })
  })

  it('둘만 남으면 쫓는 팀과 잡을 팀이 같다', () => {
    const duel = ledger({ hits: { A: 1, C: 1, E: 1 } })
    expect(deriveTailChaseObjective(duel, 'B', 'b1')).toMatchObject({ chaser: 'D', prey: 'D' })
  })

  it('마지막 생존이면 쫓는 팀도 잡을 팀도 없다', () => {
    const last = ledger({
      hits: { A: 1, C: 1, D: 1, E: 1 },
      tails: { B: ['a1', 'a2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2'] },
    })
    expect(deriveTailChaseObjective(last, 'B', 'b1')).toMatchObject({
      chaser: null,
      prey: null,
      tailCount: 8,
    })
  })

  it('잡힌 뒤 — 사슬이 합류한 팀 기준으로 바뀌고 꼬리 인원은 세지 않는다', () => {
    const caught = ledger({ hits: { C: 1 }, tails: { B: ['c1', 'c2'] } })
    expect(deriveTailChaseObjective(caught, 'C', 'c1')).toEqual({
      role: 'tail',
      team: 'B',
      chaser: 'A',
      prey: 'D',
      preyLivesLeft: null,
      tailCount: 0,
    })
  })

  it('연쇄 편입이면 나를 지금 끌고 있는 살아 있는 팀을 고른다', () => {
    // C가 B에게 잡히고, 그 B가 A에게 잡혔다 — c1은 꼬리 두 곳에 남지만 B는 이미 탈락했다
    const chain = ledger({
      hits: { C: 1, B: 1 },
      tails: { B: ['c1', 'c2'], A: ['b1', 'b2', 'c1', 'c2'] },
    })
    expect(deriveTailChaseObjective(chain, 'C', 'c1')).toMatchObject({
      role: 'tail',
      team: 'A',
      prey: 'D',
    })
  })

  it('합류한 팀까지 맞대결이거나 마지막이어도 사슬이 맞는다', () => {
    const duel = ledger({
      hits: { A: 1, C: 1, E: 1 },
      tails: { B: ['a1', 'a2', 'c1', 'c2'], D: ['e1', 'e2'] },
    })
    expect(deriveTailChaseObjective(duel, 'C', 'c1')).toMatchObject({
      team: 'B',
      chaser: 'D',
      prey: 'D',
    })
    const last = ledger({
      hits: { A: 1, C: 1, D: 1, E: 1 },
      tails: { B: ['c1', 'c2'] },
    })
    expect(deriveTailChaseObjective(last, 'C', 'c1')).toMatchObject({
      team: 'B',
      chaser: null,
      prey: null,
    })
  })

  it('잡혔는데 합류한 팀을 찾을 수 없으면 사슬을 지어내지 않는다', () => {
    expect(deriveTailChaseObjective(ledger({ hits: { C: 1 } }), 'C', 'c1')).toBeNull()
  })

  it('내 완장이 원장에 없으면 null이다', () => {
    expect(deriveTailChaseObjective(ledger(), 'Z', 'z1')).toBeNull()
  })

  it('내보내져 비어 있는 완장은 사슬에서 뺀다 — 진행자 판정 카드에도 없는 팀이다', () => {
    const kicked = ledger({ teams: { ...TEAMS, C: [] } })
    expect(deriveTailChaseObjective(kicked, 'B', 'b1')).toMatchObject({ prey: 'D' })
    expect(deriveTailChaseObjective(kicked, 'D', 'd1')).toMatchObject({ chaser: 'B' })
  })
})
