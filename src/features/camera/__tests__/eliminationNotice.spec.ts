import { describe, it, expect } from 'vitest'
import type { SubmissionRecord } from '@/features/round-ops'
import { deriveEliminationNotice, eliminatedByTeam, formatJudgedClock } from '../eliminationNotice'

/** 우리 팀(B)을 잡은 확정 킬샷 한 건 — 바뀌는 필드만 override한다 */
function hit(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: 'h1',
    uid: 'attacker1',
    team: 'E',
    round: 1,
    photo: 'data:image/jpeg;base64,hit',
    status: 'approved',
    createdAtMs: 1_000,
    targetTeam: 'B',
    multiplier: 1,
    judgedAtMs: 2_000,
    rejectReason: null,
    ...overrides,
  }
}

describe('deriveEliminationNotice (P21)', () => {
  it('맞은 적이 없으면 안내가 없다', () => {
    expect(deriveEliminationNotice([], 1, new Set())).toBeNull()
  })

  it('2인 팀(목숨 1)은 첫 피격이 탈락 안내다 — 잡은 팀·사진·시각을 싣는다', () => {
    expect(deriveEliminationNotice([hit()], 1, new Set())).toEqual({
      submissionId: 'h1',
      kind: 'out',
      attackerTeam: 'E',
      photo: 'data:image/jpeg;base64,hit',
      judgedAtMs: 2_000,
      isTripleKill: false,
      livesLeft: 0,
    })
  })

  it('1인 팀(목숨 2)의 첫 피격은 남은 목숨 안내, 두 번째가 탈락 안내다', () => {
    const first = deriveEliminationNotice([hit()], 2, new Set())
    expect(first).toMatchObject({ kind: 'hit', livesLeft: 1 })

    const second = deriveEliminationNotice(
      [hit(), hit({ id: 'h2', team: 'C', judgedAtMs: 5_000 })],
      2,
      new Set(['h1']),
    )
    expect(second).toMatchObject({ submissionId: 'h2', kind: 'out', attackerTeam: 'C', livesLeft: 0 })
  })

  it('확인한 피격은 다시 띄우지 않는다', () => {
    expect(deriveEliminationNotice([hit()], 1, new Set(['h1']))).toBeNull()
  })

  it('확인하지 않은 피격이 여럿이면 지금 상태를 말하는 마지막 것만 띄운다', () => {
    const notice = deriveEliminationNotice([hit(), hit({ id: 'h2', team: 'C' })], 2, new Set())
    expect(notice).toMatchObject({ submissionId: 'h2', kind: 'out', attackerTeam: 'C' })
  })

  it('낙오 포착 3배 확정이면 그 사실을 싣는다', () => {
    expect(deriveEliminationNotice([hit({ multiplier: 3 })], 1, new Set())).toMatchObject({
      isTripleKill: true,
    })
  })
})

describe('eliminatedByTeam (P21)', () => {
  it('목숨 수만큼째 피격의 제출 팀이 우리 팀을 탈락시킨 팀이다', () => {
    expect(eliminatedByTeam([hit()], 1)).toBe('E')
    expect(eliminatedByTeam([hit(), hit({ id: 'h2', team: 'C' })], 2)).toBe('C')
  })

  it('아직 탈락 전이면 null', () => {
    expect(eliminatedByTeam([], 1)).toBeNull()
    expect(eliminatedByTeam([hit()], 2)).toBeNull()
  })
})

describe('formatJudgedClock', () => {
  it('기기 시간대의 시:분을 두 자리로 맞춘다', () => {
    expect(formatJudgedClock(new Date(2026, 10, 8, 9, 5).getTime())).toBe('09:05')
    expect(formatJudgedClock(new Date(2026, 10, 8, 14, 32).getTime())).toBe('14:32')
  })
})
