import { describe, it, expect } from 'vitest'
import { pickXTeams } from '../xRole'

/** 지정한 시퀀스를 순환하며 돌려주는 결정적 rng */
function seededRandom(sequence: number[]): () => number {
  let index = 0
  return () => {
    const value = sequence[index % sequence.length]!
    index++
    return value
  }
}

describe('pickXTeams', () => {
  it('빈 팀만 후보에서 제외하고 1인 팀은 후보로 포함한다', () => {
    // 완장 A(blue)는 1인이지만 빈 팀이 아니므로 후보에 포함되어 유일 후보로 선정된다
    const selected = pickXTeams([{ armband: 'A', memberCount: 1 }])

    expect(selected).toEqual(new Set(['A']))
  })

  it('멤버가 없는 빈 팀은 후보에서 제외한다', () => {
    // 완장 A(blue)는 0인(빈 팀)이라 후보에서 빠진다 → 선정 없음
    const selected = pickXTeams([{ armband: 'A', memberCount: 0 }])

    expect(selected.size).toBe(0)
  })

  it('1인 팀도 2인 팀과 함께 같은 그룹 후보로 경쟁해 선정될 수 있다', () => {
    // A(1인)·E(2인)는 모두 blue 그룹. rng가 인덱스 0(A)을 고르면 1인 팀이 선정된다
    const teams = [
      { armband: 'A', memberCount: 1 },
      { armband: 'E', memberCount: 2 },
    ]

    const selected = pickXTeams(teams, () => 0)

    expect(selected).toEqual(new Set(['A']))
  })

  it('그룹마다 후보가 여럿이어도 정확히 1팀만 선정한다', () => {
    // A·E·I는 모두 blue 그룹(charCode % 4 == 0)
    const teams = [
      { armband: 'A', memberCount: 2 },
      { armband: 'E', memberCount: 2 },
      { armband: 'I', memberCount: 2 },
    ]

    const selected = pickXTeams(teams, () => 0)

    expect(selected.size).toBe(1)
  })

  it('결정적 rng로 그룹 내 선정 팀이 결정된다', () => {
    // blue 후보 순서 [A, E]. floor(random * 2)로 인덱스가 정해진다
    const teams = [
      { armband: 'A', memberCount: 2 },
      { armband: 'E', memberCount: 2 },
    ]

    expect(pickXTeams(teams, seededRandom([0]))).toEqual(new Set(['A']))
    expect(pickXTeams(teams, seededRandom([0.6]))).toEqual(new Set(['E']))
  })

  it('서로 다른 그룹은 각각 1팀씩 선정한다', () => {
    // A(blue) 2인, B(orange) 2인 → 두 그룹에서 각각 선정
    const teams = [
      { armband: 'A', memberCount: 2 },
      { armband: 'B', memberCount: 2 },
    ]

    const selected = pickXTeams(teams, () => 0)

    expect(selected).toEqual(new Set(['A', 'B']))
  })

  it('후보가 없는 그룹은 건너뛴다', () => {
    // A(blue) 2인만 후보. B(orange)는 빈 팀(0인)이라 orange 그룹은 통째로 건너뛴다
    const teams = [
      { armband: 'A', memberCount: 2 },
      { armband: 'B', memberCount: 0 },
    ]

    const selected = pickXTeams(teams, () => 0)

    expect(selected).toEqual(new Set(['A']))
  })

  it('편성마다 재호출하면 rng에 따라 독립적으로 재선정된다', () => {
    const teams = [
      { armband: 'A', memberCount: 2 },
      { armband: 'E', memberCount: 2 },
    ]

    const first = pickXTeams(teams, seededRandom([0]))
    const second = pickXTeams(teams, seededRandom([0.6]))

    expect(first).toEqual(new Set(['A']))
    expect(second).toEqual(new Set(['E']))
  })
})
