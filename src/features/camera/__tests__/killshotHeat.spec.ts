import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/round-ops', () => ({ KILLSHOT_HEAT_PER_SUBMIT_SEC: 3, KILLSHOT_HEAT_CAP_SEC: 12 }))

import {
  HEAT_CLOCK_SAFETY_MS,
  currentHeat,
  elapsedSinceLastSubmitMs,
  heatAfterSubmit,
  lockRemainingMs,
  type HeatAnchor,
} from '../killshotHeat'

function anchor(overrides: Partial<HeatAnchor> = {}): HeatAnchor {
  return { round: 1, heat: 12, lastAtMs: 100_000, receivedAtMs: 5_000, ...overrides }
}

describe('elapsedSinceLastSubmitMs — 경과를 실제보다 길게 재지 않는다', () => {
  it('받은 뒤 흐른 시간을 쓴다(서버 시각 경과가 보정 오차보다 작을 때)', () => {
    // 서버 시각으로는 1초 지났지만 보정 오차 2초를 빼면 0 — 받은 뒤 흐른 1.5초를 쓴다
    expect(elapsedSinceLastSubmitMs(anchor(), 101_000, 6_500)).toBe(1_500)
  })

  it('오래된 문서(새로고침)는 서버 시각 경과에서 보정 오차를 뺀 값을 쓴다', () => {
    expect(elapsedSinceLastSubmitMs(anchor(), 160_000, 5_000)).toBe(60_000 - HEAT_CLOCK_SAFETY_MS)
  })

  it('서버 시각이 아직 없는 내 쓰기는 받은 뒤 흐른 시간만 본다', () => {
    expect(elapsedSinceLastSubmitMs(anchor({ lastAtMs: null }), 999_999, 5_800)).toBe(800)
  })
})

describe('currentHeat', () => {
  it('문서가 없거나 다른 라운드의 열은 0이다', () => {
    expect(currentHeat(null, 1, 0, 0)).toBe(0)
    expect(currentHeat(anchor({ round: 0 }), 1, 100_000, 5_000)).toBe(0)
    expect(currentHeat(anchor(), null, 100_000, 5_000)).toBe(0)
  })

  it('흐른 초만큼 식고 0 아래로 내려가지 않는다', () => {
    expect(currentHeat(anchor(), 1, 100_000, 6_000)).toBe(11)
    expect(currentHeat(anchor(), 1, 200_000, 5_000)).toBe(0)
  })
})

describe('lockRemainingMs — 다음 1칸이 들어갈 자리가 날 때까지', () => {
  it('꽉 찬 직후는 3초, 1칸 이하로 식었으면 0이다', () => {
    expect(lockRemainingMs(12)).toBe(3_000)
    expect(lockRemainingMs(10.5)).toBe(1_500)
    expect(lockRemainingMs(9)).toBe(0)
    expect(lockRemainingMs(0)).toBe(0)
  })

  it('계산이 어긋나도 3초보다 길게 잠그지 않는다', () => {
    expect(lockRemainingMs(20)).toBe(3_000)
  })
})

describe('규칙 흐름 — 기획서 표와 같은가', () => {
  /** 일정 간격으로 낼 때, 셔터가 처음 잠기는 제출 번호(잠겨서 기다린 첫 제출) */
  function firstLockedSubmit(intervalSec: number, limit = 60): number | null {
    let heat = 0
    for (let n = 1; n <= limit; n++) {
      if (n > 1) heat = Math.max(0, heat - intervalSec)
      if (lockRemainingMs(heat) > 0) return n
      heat = heatAfterSubmit(heat)
    }
    return null
  }

  it('1초 간격은 6번째, 2초 간격은 11번째에 처음 잠기고, 3초 간격은 잠기지 않는다', () => {
    expect(firstLockedSubmit(1)).toBe(6)
    expect(firstLockedSubmit(2)).toBe(11)
    expect(firstLockedSubmit(3)).toBeNull()
  })

  it('잠긴 뒤 풀리자마자 내면 3초에 1장이다', () => {
    let heat = 12
    const waits: number[] = []
    for (let i = 0; i < 4; i++) {
      const wait = lockRemainingMs(heat)
      waits.push(wait)
      heat = heatAfterSubmit(Math.max(0, heat - wait / 1000))
    }
    expect(waits).toEqual([3_000, 3_000, 3_000, 3_000])
  })
})
