import { describe, expect, it } from 'vitest'
import {
  KING_HUNT_JUDGE_GUIDE,
  NORMAL_JUDGE_GUIDE,
  STAFF_CHASE_JUDGE_GUIDE,
  TAIL_CHASE_JUDGE_GUIDE,
} from '../judgeGuides'
import type { JudgeContext } from '../types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function context(overrides: Partial<JudgeContext> = {}): JudgeContext {
  return {
    teams: LETTERS,
    outTeams: [],
    xTeams: [],
    rosters: Object.fromEntries(LETTERS.map((armband) => [armband, [`${armband}1`, `${armband}2`]])),
    hits: {},
    ...overrides,
  }
}

describe('꼬리잡기 판정 안내', () => {
  const summary = TAIL_CHASE_JUDGE_GUIDE.exclusionSummary!

  it('대상이 하나뿐이라고 말한다', () => {
    expect(summary('B', context())).toBe('B의 대상은 C 하나뿐이에요')
  })

  it('탈락 팀을 건너뛰면 어느 팀을 건너뛰었는지 말한다', () => {
    expect(summary('B', context({ outTeams: ['C', 'D'] }))).toBe(
      'B의 대상은 E 하나뿐이에요 · C·D 탈락이라 건너뛰었어요',
    )
  })

  it('건너뛴 팀이 많으면 수만 적는다', () => {
    expect(summary('A', context({ outTeams: ['B', 'C', 'D', 'E'] }))).toBe(
      'A의 대상은 F 하나뿐이에요 · 4팀 탈락이라 건너뛰었어요',
    )
  })

  it('마지막 완장은 처음으로 돌아간다고 말한다', () => {
    expect(summary('H', context())).toBe('H의 대상은 A 하나뿐이에요 · 마지막 완장은 처음으로 돌아가요')
  })

  it('끝을 넘어 건너뛰어도 건너뛴 팀을 말한다', () => {
    expect(summary('H', context({ outTeams: ['A'] }))).toBe(
      'H의 대상은 B 하나뿐이에요 · A 탈락이라 건너뛰었어요',
    )
  })

  it('잡을 팀이 없으면 그렇게 말한다', () => {
    expect(summary('A', context({ teams: ['A', 'B'], outTeams: ['B'] }))).toBe('잡을 수 있는 팀이 없어요')
  })

  it('이 킬로 아웃되면 꼬리 편입을 안내한다', () => {
    expect(TAIL_CHASE_JUDGE_GUIDE.outcome!('B', 'C', context())).toEqual({
      note: '잡히면 팀 C 전원이 B의 꼬리로 들어가요',
      toast: '팀 C 킬샷으로 판정했어요. B의 꼬리로 들어가요.',
    })
  })

  it('1인 팀의 첫 킬은 아웃이 아니라 편입 안내가 없다', () => {
    const rosters = { ...context().rosters, C: ['C1'] }
    expect(TAIL_CHASE_JUDGE_GUIDE.outcome!('B', 'C', context({ rosters }))).toBeNull()
    expect(TAIL_CHASE_JUDGE_GUIDE.outcome!('B', 'C', context({ rosters, hits: { C: 1 } }))).not.toBeNull()
  })

  it('원장이 없는 라운드는 편입이 일어나지 않아 안내하지 않는다', () => {
    expect(TAIL_CHASE_JUDGE_GUIDE.outcome!('B', 'C', context({ rosters: {} }))).toBeNull()
  })
})

describe('왕잡기 판정 안내 (2026-11-16 기획 변경)', () => {
  const outcome = KING_HUNT_JUDGE_GUIDE.outcome!
  const xTeams = ['A', 'B']

  it('왕을 잡아 아웃시키면 찍은 사람 +30 · 잡은 팀 +10 · 왕의 그룹 전원 아웃을 보인다', () => {
    expect(outcome('C', 'B', context({ xTeams }))).toEqual({
      approveLabel: '팀 B 왕 잡기 확정',
      note: '찍은 사람 +30 · 팀 C +10 · 주황 그룹 전원 아웃',
      toast: '팀 B 왕 잡기로 판정했어요. 주황 그룹은 전원 아웃이에요.',
    })
  })

  it('1인 왕의 첫 킬은 왕이 아직 살아 있어 점수 없는 킬이다 — 한 번 더 맞아야 잡힌다고만 알린다', () => {
    const rosters = { ...context().rosters, B: ['B1'] }
    expect(outcome('C', 'B', context({ xTeams, rosters }))).toEqual({ note: '왕이 한 번 더 맞아야 잡혀요' })
  })

  it('왕이 왕을 잡아도 왕 잡기다', () => {
    expect(outcome('A', 'B', context({ xTeams }))?.approveLabel).toBe('팀 B 왕 잡기 확정')
  })

  it('왕이 일반 팀을 잡으면 특별한 결과가 없다 — 점수 없는 킬이다', () => {
    expect(outcome('A', 'C', context({ xTeams }))).toBeNull()
  })

  it('1인 팀이 왕을 잡으면 개인·팀 점수가 2배로 보인다', () => {
    const rosters = { ...context().rosters, C: ['C1'] }
    expect(outcome('C', 'B', context({ xTeams, rosters }))?.note).toBe(
      '찍은 사람 +60 · 팀 C +20 · 주황 그룹 전원 아웃',
    )
  })

  it('일반 팀끼리는 특별한 결과가 없다', () => {
    expect(outcome('C', 'D', context({ xTeams }))).toBeNull()
  })

  it('왕에만 표시가 붙는다', () => {
    expect(KING_HUNT_JUDGE_GUIDE.teamMark!('A', context({ xTeams }))).toBe('왕')
    expect(KING_HUNT_JUDGE_GUIDE.teamMark!('C', context({ xTeams }))).toBeNull()
  })
})

describe('일반전 판정 안내', () => {
  it('X 팀에 표시를 붙이고, X를 끄면 아무 표시도 없다', () => {
    expect(NORMAL_JUDGE_GUIDE.teamMark!('A', context({ xTeams: ['A'] }))).toBe('X')
    expect(NORMAL_JUDGE_GUIDE.teamMark!('A', context())).toBeNull()
  })

  it('제외 줄은 제출 팀 기준으로 어느 쪽이 빠졌는지 말한다', () => {
    const xContext = context({ xTeams: ['A'] })
    expect(NORMAL_JUDGE_GUIDE.exclusionLabel!('A', xContext)).toBe('X 아닌')
    expect(NORMAL_JUDGE_GUIDE.exclusionLabel!('B', xContext)).toBe('X')
  })
})

describe('스태프 추격전 판정 안내', () => {
  it('반려만 할 수 있다고 말한다', () => {
    expect(STAFF_CHASE_JUDGE_GUIDE.exclusionSummary!('A', context())).toBe(
      '전원 동맹이라 고를 팀이 없어요. 반려만 할 수 있어요.',
    )
  })
})
