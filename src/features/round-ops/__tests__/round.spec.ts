import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const updateDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  serverTimestamp: () => 'server-timestamp',
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
}))

import {
  ROUND_ADJUST_STEP_MS,
  ROUND_DURATION_DEFAULT_MS,
  ROUND_DURATION_MAX_MS,
  adjustRound,
  pauseRound,
  resumeRound,
  startRound,
} from '../api/round'

beforeEach(() => {
  updateDocMock.mockReset().mockResolvedValue(undefined)
})

/** 마지막 updateDoc이 쓴 round 맵 */
function writtenRound() {
  const calls = updateDocMock.mock.calls
  const [, data] = calls[calls.length - 1]!
  return data.round as Record<string, unknown>
}

describe('startRound', () => {
  it('방 문서의 round 키만 기본 20분짜리 running 상태로 쓴다', async () => {
    await startRound('AB2C')

    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C' },
      {
        round: {
          status: 'running',
          startedAt: 'server-timestamp',
          durationMs: ROUND_DURATION_DEFAULT_MS,
        },
      },
    )
    expect(ROUND_DURATION_DEFAULT_MS).toBe(20 * 60 * 1000)
  })

  it('running에는 pausedRemainingMs 키 자체가 없다 — rules가 부재를 요구한다', async () => {
    await startRound('AB2C')

    expect(writtenRound()).not.toHaveProperty('pausedRemainingMs')
  })
})

describe('pauseRound', () => {
  it('클릭 순간의 남은 시간을 durationMs와 pausedRemainingMs 양쪽에 고정한다', async () => {
    await pauseRound('AB2C', 300_000)

    expect(writtenRound()).toEqual({
      status: 'paused',
      startedAt: 'server-timestamp',
      durationMs: 300_000,
      pausedRemainingMs: 300_000,
    })
  })
})

describe('resumeRound', () => {
  it('남은 시간을 총량으로 삼아 지금부터 다시 앵커한다', async () => {
    await resumeRound('AB2C', 90_000)

    expect(writtenRound()).toEqual({
      status: 'running',
      startedAt: 'server-timestamp',
      durationMs: 90_000,
    })
  })
})

describe('adjustRound', () => {
  it('진행 중이면 남은 시간에 대기 변경값을 더하고 상태를 유지한다', async () => {
    await adjustRound('AB2C', 'running', 300_000, ROUND_ADJUST_STEP_MS)

    expect(writtenRound()).toEqual({
      status: 'running',
      startedAt: 'server-timestamp',
      durationMs: 360_000,
    })
  })

  it('정지 중에 조정해도 저절로 재개되지 않는다(paused 유지 + 고정값도 함께 갱신)', async () => {
    await adjustRound('AB2C', 'paused', 300_000, -ROUND_ADJUST_STEP_MS)

    expect(writtenRound()).toEqual({
      status: 'paused',
      startedAt: 'server-timestamp',
      durationMs: 240_000,
      pausedRemainingMs: 240_000,
    })
  })

  it('결과가 음수면 0으로 클램프한다(즉시 종료 표시)', async () => {
    await adjustRound('AB2C', 'running', 30_000, -5 * ROUND_ADJUST_STEP_MS)

    expect(writtenRound()).toMatchObject({ durationMs: 0 })
  })

  it('상한을 넘으면 3시간으로 클램프한다 — rules가 거부할 값을 보내지 않는다', async () => {
    await adjustRound('AB2C', 'running', ROUND_DURATION_MAX_MS, 10 * ROUND_ADJUST_STEP_MS)

    expect(writtenRound()).toMatchObject({ durationMs: ROUND_DURATION_MAX_MS })
  })

  it('남은 시간의 소수점을 정수로 만든다 — rules가 durationMs is int를 요구한다', async () => {
    await adjustRound('AB2C', 'running', 1234.56, 0)

    expect(writtenRound()).toMatchObject({ durationMs: 1235 })
  })
})

/**
 * firestore.rules의 라운드 갈래는 클라 상수·스키마의 이중 정의다(rules는 클라 코드를 import
 * 불가). 한쪽만 바꾸면 운영 컨트롤이 전면 403이 되므로, rules 파일을 직접 읽어 대조한다.
 */
describe('firestore.rules 라운드 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

  it('rules의 durationMs 상한이 ROUND_DURATION_MAX_MS와 숫자까지 동일하다', () => {
    const match = rules.match(/round\.durationMs <= (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(ROUND_DURATION_MAX_MS)
  })

  it('round 맵만 바꾸는 갈래가 playing 상태에서만 열려 있다', () => {
    expect(rules).toContain("affectedKeys().hasOnly(['round'])")
    expect(rules).toContain('isValidRound(request.resource.data.round)')
    expect(rules).toMatch(/hasOnly\(\['round'\]\)\s*\n\s*&& resource\.data\.status == 'playing'/)
  })

  it('rules가 라운드 상태 값과 pausedRemainingMs 부재 조건을 강제한다', () => {
    expect(rules).toContain("round.status in ['running', 'paused']")
    expect(rules).toContain("!('pausedRemainingMs' in round)")
  })
})
