import { describe, it, expect } from 'vitest'
import type { RoundState } from '../api/rooms'
import { computeRoundRemainingMs, isRoundLive } from '../roundClock'

const NOW = new Date('2026-08-31T10:00:00Z').getTime()

function runningRound(startedAtMs: number | null, durationMs: number): RoundState {
  return { status: 'running', startedAtMs, durationMs, pausedRemainingMs: null }
}

function pausedRound(pausedRemainingMs: number): RoundState {
  return { status: 'paused', startedAtMs: NOW, durationMs: pausedRemainingMs, pausedRemainingMs }
}

describe('computeRoundRemainingMs', () => {
  it('진행 중이면 총량에서 앵커 이후 경과분을 뺀다', () => {
    expect(computeRoundRemainingMs(runningRound(NOW, 1_200_000), NOW + 60_000)).toBe(1_140_000)
  })

  it('총량을 넘겨도 음수로 내려가지 않는다', () => {
    expect(computeRoundRemainingMs(runningRound(NOW, 1000), NOW + 5000)).toBe(0)
  })

  it('서버 앵커가 로컬 시각보다 미래여도 남은 시간이 총량을 넘지 않는다', () => {
    expect(computeRoundRemainingMs(runningRound(NOW + 500, 1_200_000), NOW)).toBe(1_200_000)
  })

  it('정지 중이면 고정해 둔 남은 시간을 그대로 쓴다(시간이 흘러도 불변)', () => {
    const round = pausedRound(300_000)
    expect(computeRoundRemainingMs(round, NOW)).toBe(300_000)
    expect(computeRoundRemainingMs(round, NOW + 600_000)).toBe(300_000)
  })

  it('serverTimestamp 반영 전(앵커 null)에는 총량을 그대로 남은 시간으로 본다', () => {
    expect(computeRoundRemainingMs(runningRound(null, 1_200_000), NOW + 60_000)).toBe(1_200_000)
  })
})

describe('isRoundLive', () => {
  it('라운드 자체가 없으면(시작 전·종료 후) 살아 있지 않다', () => {
    expect(isRoundLive(null, NOW)).toBe(false)
  })

  it('남은 시간이 있으면 살아 있다', () => {
    expect(isRoundLive(runningRound(NOW, 1_200_000), NOW + 60_000)).toBe(true)
  })

  it('타이머가 0에 닿으면 round 필드가 남아 있어도 살아 있지 않다', () => {
    // 호스트가 게임을 종료하기 전 구간 — 여기서 콕핏 복귀를 막는 것이 A-4 수정의 핵심이다
    expect(isRoundLive(runningRound(NOW, 1_200_000), NOW + 1_200_000)).toBe(false)
  })

  it('진행자가 시간을 더하면 다시 살아난다', () => {
    const expired = runningRound(NOW, 1_200_000)
    expect(isRoundLive(expired, NOW + 1_200_000)).toBe(false)

    const extended = runningRound(NOW, 1_500_000)
    expect(isRoundLive(extended, NOW + 1_200_000)).toBe(true)
  })

  it('올스탑(정지) 중에는 남은 시간이 보존되므로 살아 있다', () => {
    // 정지는 진행자가 곧 푸는 일시 상태라 플레이어가 콕핏을 떠날 이유가 없다
    expect(isRoundLive(pausedRound(300_000), NOW + 600_000)).toBe(true)
  })

  it('정지 상태로 남은 시간이 0이면 살아 있지 않다', () => {
    expect(isRoundLive(pausedRound(0), NOW)).toBe(false)
  })
})
