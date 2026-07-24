import { describe, it, expect } from 'vitest'
import type { Gender } from '@/features/auth'
import {
  assignTeams,
  deriveCarryover,
  MIN_TEAM_CANDIDATES,
  type TeamCandidate,
} from '../teamAssignment'

/**
 * 셔플을 항등(no-op)으로 만드는 rng. Fisher–Yates는 각 i에서 j=floor(r*(i+1))와 swap하므로,
 * r이 1에 아주 가까우면 j===i가 되어 아무도 이동하지 않는다. 덕분에 배정 순서가 입력 순서와
 * 같아져 결과를 결정적으로 검증할 수 있다(테스트 규모 인원에서 안전).
 */
const identityRandom = () => 0.999999

/** 지정한 시퀀스를 순환하며 돌려주는 결정적 rng — 실제 셔플이 일어나는 경로를 검증할 때 쓴다 */
function seededRandom(sequence: number[]): () => number {
  let index = 0
  return () => {
    const value = sequence[index % sequence.length]!
    index++
    return value
  }
}

/** 테스트 후보 생성기 — 성별·이월 streak·직전 짝 이력을 지정한다 */
function candidate(
  id: string,
  gender: Gender | null,
  sameGenderStreak = 0,
  previousPartnerIds: string[] = [],
): TeamCandidate {
  return { id, gender, sameGenderStreak, previousPartnerIds }
}

/** teams 전체에 배정된 멤버 id를 평탄화해 모은다(전원 배정·중복 검증용) */
function assignedIds(teams: { members: TeamCandidate[] }[]): string[] {
  return teams.flatMap((team) => team.members.map((member) => member.id))
}

/** 지정 id가 속한 팀에서 그 사람의 짝(다른 멤버) id를 돌려준다. 1인 팀이면 undefined */
function partnerId(teams: { members: TeamCandidate[] }[], id: string): string | undefined {
  const team = teams.find((entry) => entry.members.some((member) => member.id === id))!
  return team.members.find((member) => member.id !== id)?.id
}

/** 두 후보가 직전 짝이었는지(양방향) — teamAssignment 내부 werePartners와 동일한 판정 */
function werePartnersT(a: TeamCandidate, b: TeamCandidate): boolean {
  return a.previousPartnerIds.includes(b.id) || b.previousPartnerIds.includes(a.id)
}

/** teams에서 두 멤버가 직전 짝이었던 2인 팀 수(= 재짝꿍 쌍 수)를 센다. 1인 팀은 0 기여 */
function countRematches(teams: { members: TeamCandidate[] }[]): number {
  return teams.filter(
    (team) => team.members.length === 2 && werePartnersT(team.members[0]!, team.members[1]!),
  ).length
}

/**
 * 결정적 LCG 난수 생성기(Math.random 금지). 속성 테스트의 케이스 생성을 시드로 재현 가능하게 한다.
 * 상수는 Numerical Recipes의 표준 LCG 계수.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** 혼성 슬롯 짝짓기의 최소 재짝꿍 수(브루트포스 oracle) — 남자마다 서로 다른 여자를 배정 */
function minMixedRematches(males: TeamCandidate[], females: TeamCandidate[]): number {
  if (males.length === 0) return 0
  const [male, ...restMales] = males
  let min = Infinity
  for (let i = 0; i < females.length; i++) {
    const female = females[i]!
    const add = werePartnersT(male!, female) ? 1 : 0
    const rest = females.filter((_, index) => index !== i)
    min = Math.min(min, add + minMixedRematches(restMales, rest))
  }
  return min
}

/**
 * 남은 풀 짝짓기의 최소 재짝꿍 수(브루트포스 oracle) — 첫 사람을 각 후보와 짝짓고, 홀수면 solo도
 * 탐색. solo는 홀수일 때만 허용해 solo가 2명 이상 생기지 않게 한다(production pairPool과 동일).
 */
function minPoolRematches(pool: TeamCandidate[]): number {
  if (pool.length <= 1) return 0
  const [first, ...rest] = pool
  let min = Infinity
  for (let i = 0; i < rest.length; i++) {
    const candidate = rest[i]!
    const add = werePartnersT(first!, candidate) ? 1 : 0
    const remaining = rest.filter((_, index) => index !== i)
    min = Math.min(min, add + minPoolRematches(remaining))
  }
  if (pool.length % 2 === 1) {
    min = Math.min(min, minPoolRematches(rest))
  }
  return min
}

/**
 * assignTeams(항등 rng)와 동일한 혼성 슬롯 선발을 재현한 뒤, 브루트포스로 전체 최소 재짝꿍 수를
 * 구한다. 항등 rng라 셔플이 no-op이므로 입력 순서 그대로 선발하면 공정 비교가 된다.
 */
function oracleMinRematches(candidates: TeamCandidate[]): number {
  const males = candidates.filter((c) => c.gender === 'male')
  const females = candidates.filter((c) => c.gender === 'female')
  const mixedCount = Math.min(males.length, females.length)
  const malesByStreak = [...males].sort((a, b) => b.sameGenderStreak - a.sameGenderStreak)
  const femalesByStreak = [...females].sort((a, b) => b.sameGenderStreak - a.sameGenderStreak)
  const selectedMales = malesByStreak.slice(0, mixedCount)
  const selectedFemales = femalesByStreak.slice(0, mixedCount)
  const selectedIds = new Set([...selectedMales, ...selectedFemales].map((c) => c.id))
  const remaining = candidates.filter((c) => !selectedIds.has(c.id))
  return minMixedRematches(selectedMales, selectedFemales) + minPoolRematches(remaining)
}

describe('assignTeams', () => {
  it('남2 여2 — 혼성 2팀이 되고 모든 팀이 혼성, nextStreaks는 전원 0', () => {
    const candidates = [
      candidate('m1', 'male'),
      candidate('m2', 'male'),
      candidate('f1', 'female'),
      candidate('f2', 'female'),
    ]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(2)
    expect(teams.every((team) => team.isMixed)).toBe(true)
    expect(teams.every((team) => team.members.length === 2)).toBe(true)
    expect(nextStreaks).toEqual({ m1: 0, m2: 0, f1: 0, f2: 0 })
  })

  it('남4 여2 — 혼성 2팀 + 남남 1팀, 비혼성 팀원 2명만 streak+1', () => {
    const candidates = [
      candidate('m1', 'male'),
      candidate('m2', 'male'),
      candidate('m3', 'male'),
      candidate('m4', 'male'),
      candidate('f1', 'female'),
      candidate('f2', 'female'),
    ]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    const mixedTeams = teams.filter((team) => team.isMixed)
    const nonMixedTeams = teams.filter((team) => !team.isMixed)
    expect(mixedTeams).toHaveLength(2)
    expect(nonMixedTeams).toHaveLength(1)
    // 남은 남자 2명(m3, m4)만 비혼성 팀 → streak+1, 나머지는 0
    expect(nextStreaks).toEqual({ m1: 0, m2: 0, f1: 0, f2: 0, m3: 1, m4: 1 })
  })

  it('이월 우선권 — streak 높은 남자가 혼성 슬롯을 먼저 가져가고, 낮은 남자가 남남 팀으로 간다', () => {
    // 남4의 streak가 [1,1,0,0]. 혼성 슬롯 2개는 streak 1인 m1,m2가 차지해야 한다
    const candidates = [
      candidate('m1', 'male', 1),
      candidate('m2', 'male', 1),
      candidate('m3', 'male', 0),
      candidate('m4', 'male', 0),
      candidate('f1', 'female'),
      candidate('f2', 'female'),
    ]

    const { nextStreaks } = assignTeams(candidates, identityRandom)

    // 혼성으로 간 m1,m2는 0으로 리셋, 남남으로 밀린 m3,m4는 0+1=1로 이월
    expect(nextStreaks.m1).toBe(0)
    expect(nextStreaks.m2).toBe(0)
    expect(nextStreaks.m3).toBe(1)
    expect(nextStreaks.m4).toBe(1)
  })

  it('리셋 — streak 3인 사람이 혼성 배정되면 nextStreaks는 0', () => {
    const candidates = [candidate('m1', 'male', 3), candidate('f1', 'female', 3)]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(1)
    expect(teams[0]!.isMixed).toBe(true)
    expect(nextStreaks).toEqual({ m1: 0, f1: 0 })
  })

  it('성별 미상 — unknown은 혼성 슬롯에 못 들어가고 남은 풀로 가며, 그 팀은 비혼성이라 streak+1', () => {
    const candidates = [
      candidate('m1', 'male'),
      candidate('m2', 'male'),
      candidate('f1', 'female'),
      candidate('u1', null),
    ]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    // 혼성 1팀(m1,f1) + 비혼성 1팀(m2,u1). unknown은 남녀 동시 포함이 아니라 혼성 판정에 기여 못 함
    const mixedTeams = teams.filter((team) => team.isMixed)
    expect(mixedTeams).toHaveLength(1)
    const teamWithUnknown = teams.find((team) => team.members.some((member) => member.id === 'u1'))!
    expect(teamWithUnknown.isMixed).toBe(false)
    expect(nextStreaks).toEqual({ m1: 0, f1: 0, m2: 1, u1: 1 })
  })

  it('홀수(남3 여2) — 혼성 2팀 + 1인 팀 1개(혼성 슬롯에서 밀린 남자), 1인 팀만 streak+1', () => {
    const candidates = [
      candidate('m1', 'male'),
      candidate('m2', 'male'),
      candidate('m3', 'male'),
      candidate('f1', 'female'),
      candidate('f2', 'female'),
    ]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(3)
    const mixedTeams = teams.filter((team) => team.isMixed)
    const soloTeams = teams.filter((team) => team.members.length === 1)
    // 홀수라 정확히 한 팀만 1인
    expect(mixedTeams).toHaveLength(2)
    expect(soloTeams).toHaveLength(1)
    expect(soloTeams[0]!.isMixed).toBe(false)
    // streak가 모두 0으로 동률이라 셔플(항등) 순서상 마지막인 m3가 혼성 슬롯 선발에서 밀린다
    expect(soloTeams[0]!.members[0]!.id).toBe('m3')
    expect(nextStreaks).toEqual({ m1: 0, m2: 0, f1: 0, f2: 0, m3: 1 })
  })

  it('홀수 + 혼성 없음(남3) — 남은 1명이 1인 팀이 되어 2인 비혼성 1팀 + 1인 팀 1개, 전원 streak+1', () => {
    const candidates = [candidate('m1', 'male'), candidate('m2', 'male'), candidate('m3', 'male')]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(2)
    const soloTeam = teams.find((team) => team.members.length === 1)!
    const pairTeam = teams.find((team) => team.members.length === 2)!
    expect(soloTeam.isMixed).toBe(false)
    expect(pairTeam.isMixed).toBe(false)
    expect(nextStreaks).toEqual({ m1: 1, m2: 1, m3: 1 })
  })

  it('전원 같은 성별 짝수(남4) — 비혼성 2팀, 전원 streak+1', () => {
    const candidates = [
      candidate('m1', 'male'),
      candidate('m2', 'male'),
      candidate('m3', 'male'),
      candidate('m4', 'male'),
    ]

    const { teams, nextStreaks } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(2)
    expect(teams.every((team) => !team.isMixed)).toBe(true)
    expect(nextStreaks).toEqual({ m1: 1, m2: 1, m3: 1, m4: 1 })
  })

  it('1명이면 1인 팀 1개 + streak+1, 0명이면 최소 인원을 명시하며 throw한다', () => {
    const { teams, nextStreaks, nextPartnerIds } = assignTeams(
      [candidate('m1', 'male', 0, ['x'])],
      identityRandom,
    )
    expect(teams).toHaveLength(1)
    expect(teams[0]!.members.map((member) => member.id)).toEqual(['m1'])
    expect(teams[0]!.isMixed).toBe(false)
    expect(nextStreaks).toEqual({ m1: 1 })
    // 1인 팀은 짝이 없으므로 기존 이력이 그대로 이월된다
    expect(nextPartnerIds).toEqual({ m1: ['x'] })

    expect(() => assignTeams([], identityRandom)).toThrow(String(MIN_TEAM_CANDIDATES))
  })

  it('입력 불변성 — 호출 후 입력 배열과 후보 객체가 변형되지 않는다', () => {
    const original = [
      candidate('m1', 'male', 2),
      candidate('m2', 'male', 0),
      candidate('f1', 'female', 1),
      candidate('u1', null, 0),
    ]
    const snapshot = original.map((entry) => ({ ...entry }))

    assignTeams(original, identityRandom)

    expect(original).toHaveLength(snapshot.length)
    expect(original).toEqual(snapshot)
  })

  it('전원 배정 보장 — 여러 인원 조합에서 teams의 멤버 합집합이 입력 전원과 정확히 일치한다', () => {
    const compositions: TeamCandidate[][] = [
      [candidate('a', 'male'), candidate('b', 'female')],
      [candidate('a', 'male'), candidate('b', 'male'), candidate('c', 'female')],
      [
        candidate('a', 'male'),
        candidate('b', 'female'),
        candidate('c', null),
        candidate('d', 'male'),
        candidate('e', 'female'),
      ],
      [
        candidate('a', 'male'),
        candidate('b', 'male'),
        candidate('c', 'male'),
        candidate('d', 'female'),
        candidate('e', 'female'),
        candidate('f', 'female'),
        candidate('g', null),
      ],
    ]

    for (const composition of compositions) {
      // 실제 셔플이 일어나는 경로(항등이 아닌 rng)에서도 누락·중복이 없어야 한다
      const { teams } = assignTeams(composition, seededRandom([0, 0.5, 0.25, 0.75]))
      const ids = assignedIds(teams).sort()
      const expected = composition.map((entry) => entry.id).sort()
      expect(ids).toEqual(expected)
      // 중복 없음: 합집합 크기 = 입력 인원 수
      expect(new Set(ids).size).toBe(composition.length)
    }
  })

  it('혼성 회피 — 남2 여2에서 m1↔f1이 직전 짝이면 m1-f2, m2-f1로 짝지어진다', () => {
    const candidates = [
      candidate('m1', 'male', 0, ['f1']),
      candidate('m2', 'male'),
      candidate('f1', 'female', 0, ['m1']),
      candidate('f2', 'female'),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    expect(teams.every((team) => team.isMixed)).toBe(true)
    expect(partnerId(teams, 'm1')).toBe('f2')
    expect(partnerId(teams, 'm2')).toBe('f1')
  })

  it('회피 불가 fallback — 남1 여1이 서로 직전 짝이어도 혼성 1팀이 성립한다', () => {
    const candidates = [candidate('m1', 'male', 0, ['f1']), candidate('f1', 'female', 0, ['m1'])]

    const { teams, nextPartnerIds } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(1)
    expect(teams[0]!.isMixed).toBe(true)
    expect(partnerId(teams, 'm1')).toBe('f1')
    // 재짝꿍이 허용됐지만 이력에 중복으로 쌓이지 않는다
    expect(nextPartnerIds).toEqual({ m1: ['f1'], f1: ['m1'] })
  })

  it('streak 우선권과 회피의 독립성 — 선발은 streak 우선(m1·m2) 그대로, 짝만 회피로 바뀐다', () => {
    // 남4 streak [1,1,0,0], m1↔f1 직전 짝. 혼성 슬롯 선발은 여전히 m1·m2여야 한다
    const candidates = [
      candidate('m1', 'male', 1, ['f1']),
      candidate('m2', 'male', 1),
      candidate('m3', 'male', 0),
      candidate('m4', 'male', 0),
      candidate('f1', 'female'),
      candidate('f2', 'female'),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    // 선발: streak 높은 m1·m2가 혼성으로, m3·m4가 비혼성 팀으로
    const mixedIds = teams
      .filter((team) => team.isMixed)
      .flatMap((team) => team.members.map((member) => member.id))
    expect(mixedIds.sort()).toEqual(['f1', 'f2', 'm1', 'm2'])
    // 짝짓기만 회피 적용
    expect(partnerId(teams, 'm1')).toBe('f2')
    expect(partnerId(teams, 'm2')).toBe('f1')
  })

  it('비혼성 회피 — 남4(항등 셔플)에서 m1↔m2 직전 짝이면 m1-m3, m2-m4로 짝지어진다', () => {
    const candidates = [
      candidate('m1', 'male', 0, ['m2']),
      candidate('m2', 'male', 0, ['m1']),
      candidate('m3', 'male'),
      candidate('m4', 'male'),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    expect(teams.every((team) => !team.isMixed)).toBe(true)
    expect(partnerId(teams, 'm1')).toBe('m3')
    expect(partnerId(teams, 'm2')).toBe('m4')
  })

  it('nextPartnerIds — 기존 이력 뒤에 새 팀원이 덧붙고 중복이 없으며, 1인 팀은 이력이 그대로다', () => {
    // m1은 기존 이력 ['m2']를 가진 채 m3와 짝(m2는 직전 짝이라 회피됨) → ['m2','m3']
    // m2는 1인 팀으로 남고 기존 이력 ['q']가 그대로 이월된다
    const candidates = [
      candidate('m1', 'male', 0, ['m2']),
      candidate('m2', 'male', 0, ['q']),
      candidate('m3', 'male'),
    ]

    const { teams, nextPartnerIds } = assignTeams(candidates, identityRandom)

    expect(partnerId(teams, 'm1')).toBe('m3')
    expect(partnerId(teams, 'm2')).toBeUndefined()
    // 기존 'm2' 유지 + 'm3' 덧붙임(중복 없음)
    expect(nextPartnerIds.m1).toEqual(['m2', 'm3'])
    expect(nextPartnerIds.m3).toEqual(['m1'])
    // 1인 팀 m2는 기존 이력 그대로
    expect(nextPartnerIds.m2).toEqual(['q'])
  })

  it('QA F-03 재현(혼성) — 남3 여2, 남삼 streak1, 직전 짝 남일↔여이·남이↔여일이면 혼성 재짝꿍 0', () => {
    // 남일=m1, 남이=m2, 남삼=m3 / 여일=f1, 여이=f2. 이력은 양방향 대칭으로 세팅한다.
    // greedy는 남삼(제약 없음)이 첫 여자를 소진해 뒤 남자가 fallback 재짝을 만들었지만(F-03),
    // 회피 가능한 배치(남삼-여이, 남일-여일)가 존재하므로 탐색은 재짝꿍 0을 찾아야 한다.
    const candidates = [
      candidate('m1', 'male', 0, ['f2']),
      candidate('m2', 'male', 0, ['f1']),
      candidate('m3', 'male', 1),
      candidate('f1', 'female', 0, ['m2']),
      candidate('f2', 'female', 0, ['m1']),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    const mixedTeams = teams.filter((team) => team.isMixed)
    // 이월 우선권: 남삼(streak 1)은 반드시 혼성 슬롯에 선발된다(선발 규칙 불변 확인).
    const mixedIds = mixedTeams.flatMap((team) => team.members.map((member) => member.id))
    expect(mixedTeams).toHaveLength(2)
    expect(mixedIds).toContain('m3')
    // 혼성 2팀에 재짝꿍이 한 쌍도 없어야 한다.
    expect(countRematches(mixedTeams)).toBe(0)
  })

  it('QA F-03 재현 — 어떤 셔플 순서(여러 고정 rng)로도 혼성 재짝꿍 0', () => {
    const candidates = [
      candidate('m1', 'male', 0, ['f2']),
      candidate('m2', 'male', 0, ['f1']),
      candidate('m3', 'male', 1),
      candidate('f1', 'female', 0, ['m2']),
      candidate('f2', 'female', 0, ['m1']),
    ]

    // 실제 셔플이 일어나는 여러 결정적 rng 시퀀스에서도 회피 가능하면 재짝꿍 0이어야 한다.
    const rngSequences = [
      [0, 0.5, 0.25, 0.75, 0.1],
      [0.9, 0.1, 0.6, 0.3, 0.8],
      [0.33, 0.66, 0.99, 0.01, 0.5],
      [0.2, 0.4, 0.6, 0.8, 0.15],
    ]

    for (const sequence of rngSequences) {
      const { teams } = assignTeams(candidates, seededRandom(sequence))
      const mixedTeams = teams.filter((team) => team.isMixed)
      expect(mixedTeams).toHaveLength(2)
      // 남삼(streak 1)은 셔플과 무관하게 항상 혼성 슬롯에 선발된다.
      expect(mixedTeams.flatMap((team) => team.members.map((m) => m.id))).toContain('m3')
      expect(countRematches(mixedTeams)).toBe(0)
    }
  })

  it('비혼성 회피 가능 — 남4[a,b,c,d], 직전 짝 a↔b·b↔d면 재짝꿍 0 조합을 찾는다', () => {
    // greedy는 a-c를 먼저 만들어 b-d 재짝을 강제하지만, (a,d)(b,c)면 재짝꿍 0이다.
    const candidates = [
      candidate('a', 'male', 0, ['b']),
      candidate('b', 'male', 0, ['a', 'd']),
      candidate('c', 'male', 0),
      candidate('d', 'male', 0, ['b']),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    expect(teams.every((team) => !team.isMixed)).toBe(true)
    // 구체 짝이 아니라 "재짝꿍 수 0"으로 단언한다(회피 가능한 조합이 여럿).
    expect(countRematches(teams)).toBe(0)
  })

  it('홀수 solo 최적화 — 풀 3명[a,b,c], a↔b·a↔c 직전 짝이면 a가 solo가 되고 b-c 페어(재짝꿍 0)', () => {
    // a만 두 사람과 직전 짝이라, a를 짝지으면 반드시 재짝꿍이 생긴다. a를 solo로 두면 b-c는
    // 서로 직전 짝이 아니라 재짝꿍 0 — 탐색이 solo 선택까지 최적화해야 한다.
    const candidates = [
      candidate('a', 'male', 0, ['b', 'c']),
      candidate('b', 'male', 0, ['a']),
      candidate('c', 'male', 0, ['a']),
    ]

    const { teams } = assignTeams(candidates, identityRandom)

    const soloTeam = teams.find((team) => team.members.length === 1)!
    const pairTeam = teams.find((team) => team.members.length === 2)!
    expect(soloTeam.members[0]!.id).toBe('a')
    expect(pairTeam.members.map((m) => m.id).sort()).toEqual(['b', 'c'])
    expect(countRematches(teams)).toBe(0)
  })

  it('진짜 회피 불가 — 남1 여1이 서로 직전 짝이면 재짝꿍 1쌍을 허용한다', () => {
    const candidates = [candidate('m1', 'male', 0, ['f1']), candidate('f1', 'female', 0, ['m1'])]

    const { teams } = assignTeams(candidates, identityRandom)

    expect(teams).toHaveLength(1)
    expect(teams[0]!.isMixed).toBe(true)
    // 회피 불가이므로 재짝꿍이 정확히 1쌍(배정이 막히지 않음).
    expect(countRematches(teams)).toBe(1)
  })

  it('브루트포스 oracle 속성 테스트 — 4~7명 랜덤 200케이스에서 재짝꿍 수가 브루트포스 최소와 일치', () => {
    const rng = lcg(0x5eed_1234)
    const iterations = 200

    for (let iteration = 0; iteration < iterations; iteration++) {
      const size = 4 + Math.floor(rng() * 4) // 4..7
      const ids = Array.from({ length: size }, (_, index) => `p${index}`)

      // 성별·streak를 랜덤으로 부여한다(가입 시 성별 필수라 null은 제외).
      const genders = ids.map((): Gender => (rng() < 0.5 ? 'male' : 'female'))
      const streaks = ids.map(() => Math.floor(rng() * 3)) // 0..2

      // 직전 짝 이력을 희소하게 랜덤 생성(양방향 대칭).
      const partners: Record<string, string[]> = {}
      for (const id of ids) partners[id] = []
      for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
          if (rng() < 0.25) {
            partners[ids[i]!]!.push(ids[j]!)
            partners[ids[j]!]!.push(ids[i]!)
          }
        }
      }

      const candidates = ids.map((id, index) =>
        candidate(id, genders[index]!, streaks[index]!, [...partners[id]!]),
      )

      // 항등 rng로 셔플을 no-op으로 만들어 oracle의 선발 재현과 일치시킨다.
      const { teams } = assignTeams(candidates, identityRandom)
      const actual = countRematches(teams)
      const expected = oracleMinRematches(candidates)

      expect(actual, `case ${iteration} (size ${size}) 재짝꿍 최소 불일치`).toBe(expected)
    }
  })
})

describe('deriveCarryover', () => {
  it('혼성 팀원은 streak 0으로 리셋한다', () => {
    const teams = [[candidate('m1', 'male', 3), candidate('f1', 'female', 2)]]

    const { nextStreaks } = deriveCarryover(teams)

    expect(nextStreaks).toEqual({ m1: 0, f1: 0 })
  })

  it('비혼성 팀원은 기존 streak + 1로 이월한다(1인 팀 포함)', () => {
    const teams = [
      [candidate('m1', 'male', 1), candidate('m2', 'male', 0)],
      [candidate('m3', 'male', 2)],
    ]

    const { nextStreaks } = deriveCarryover(teams)

    expect(nextStreaks).toEqual({ m1: 2, m2: 1, m3: 3 })
  })

  it('성별 미상 멤버가 낀 팀은 혼성이 아니라 streak+1이 된다', () => {
    const teams = [[candidate('m1', 'male', 0), candidate('u1', null, 0)]]

    const { nextStreaks } = deriveCarryover(teams)

    expect(nextStreaks).toEqual({ m1: 1, u1: 1 })
  })

  it('수동 편집 시나리오 — 배정 당시 혼성이던 팀이 편집으로 남남이 되면 재산출은 비혼성으로 판정한다', () => {
    // 배정 결과는 혼성(m-f)이었지만, 보드에서 f를 빼고 m을 넣어 남남이 된 최종 구성으로 재산출
    const editedTeams = [
      [candidate('m1', 'male', 0, ['f1']), candidate('m2', 'male', 0, ['f2'])],
      [candidate('f1', 'female', 0, ['m1']), candidate('f2', 'female', 0, ['m2'])],
    ]

    const { nextStreaks, nextPartnerIds } = deriveCarryover(editedTeams)

    // 두 팀 모두 동성 → 전원 streak+1
    expect(nextStreaks).toEqual({ m1: 1, m2: 1, f1: 1, f2: 1 })
    // 기존 이력 뒤에 새 팀원이 중복 없이 덧붙는다
    expect(nextPartnerIds.m1).toEqual(['f1', 'm2'])
    expect(nextPartnerIds.f1).toEqual(['m1', 'f2'])
  })

  it('빈 입력이면 빈 이월값을 반환한다', () => {
    expect(deriveCarryover([])).toEqual({ nextStreaks: {}, nextPartnerIds: {} })
  })
})
