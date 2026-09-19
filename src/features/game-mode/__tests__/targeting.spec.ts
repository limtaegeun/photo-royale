import { describe, it, expect } from 'vitest'
import { ALL_ALLIES_TARGETING, ALLY_GROUP_TARGETING, TAIL_CHASE_TARGETING, nextPreyOf } from '../targeting'
import type { TargetContext } from '../types'

function context(teams: string[], outTeams: string[] = []): TargetContext {
  return { teams, outTeams }
}

describe('nextPreyOf (꼬리잡기 P07 §4.2)', () => {
  it('알파벳 순으로 바로 다음 살아 있는 완장을 사냥 대상으로 한다', () => {
    expect(nextPreyOf('A', context(['A', 'B', 'C']))).toBe('B')
  })

  it('마지막 완장은 첫 완장으로 감긴다', () => {
    expect(nextPreyOf('C', context(['A', 'B', 'C']))).toBe('A')
  })

  it('탈락한 팀은 건너뛴다', () => {
    expect(nextPreyOf('A', context(['A', 'B', 'C'], ['B']))).toBe('C')
  })

  it('공격 팀 혼자만 남으면 잡을 대상이 없다', () => {
    expect(nextPreyOf('A', context(['A']))).toBeNull()
  })
})

describe('TAIL_CHASE_TARGETING', () => {
  const ctx = context(['A', 'B', 'C'])

  it('바로 다음 알파벳만 잡을 수 있다', () => {
    expect(TAIL_CHASE_TARGETING.canTarget('A', 'B', ctx)).toBe(true)
    expect(TAIL_CHASE_TARGETING.canTarget('A', 'C', ctx)).toBe(false)
  })

  it('막힌 이유 배지는 "다음 알파벳 아님"이다', () => {
    expect(TAIL_CHASE_TARGETING.blockedBadge).toBe('다음 알파벳 아님')
  })
})

describe('ALLY_GROUP_TARGETING', () => {
  const ctx = context(['A', 'B', 'F'])

  it('같은 그룹(B·F는 주황)은 잡을 수 없고, 다른 그룹(A는 파랑)은 잡을 수 있다', () => {
    expect(ALLY_GROUP_TARGETING.canTarget('B', 'F', ctx)).toBe(false)
    expect(ALLY_GROUP_TARGETING.canTarget('B', 'A', ctx)).toBe(true)
  })
})

describe('ALL_ALLIES_TARGETING (스태프 추격전 P07 §4.5)', () => {
  const ctx = context(['A', 'B', 'C'])

  it('참가자 전원이 동맹이라 어떤 팀도 잡을 수 없다', () => {
    expect(ALL_ALLIES_TARGETING.canTarget('A', 'B', ctx)).toBe(false)
    expect(ALL_ALLIES_TARGETING.canTarget('A', 'C', ctx)).toBe(false)
  })

  it('막힌 이유 배지는 "동맹"이다', () => {
    expect(ALL_ALLIES_TARGETING.blockedBadge).toBe('동맹')
  })
})
