import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { RoundState } from '@/features/waiting-room'
import { ROUND_DURATION_DEFAULT_MS } from '../api/round'
import { computeRemainingMs, formatRemaining, useRoundTimer } from '../composables/useRoundTimer'

const NOW = new Date('2026-07-25T19:20:00Z').getTime()

function runningRound(startedAtMs: number | null, durationMs: number): RoundState {
  return { status: 'running', startedAtMs, durationMs, pausedRemainingMs: null }
}

function pausedRound(pausedRemainingMs: number): RoundState {
  return { status: 'paused', startedAtMs: NOW, durationMs: pausedRemainingMs, pausedRemainingMs }
}

describe('computeRemainingMs', () => {
  it('라운드 시작 전(null)에는 기본 20분을 미리 보여준다', () => {
    expect(computeRemainingMs(null, NOW)).toBe(ROUND_DURATION_DEFAULT_MS)
  })

  it('진행 중이면 총량에서 앵커 이후 경과분을 뺀다', () => {
    expect(computeRemainingMs(runningRound(NOW, 1_200_000), NOW + 60_000)).toBe(1_140_000)
  })

  it('정지 중이면 고정해 둔 남은 시간을 그대로 쓴다(시간이 흘러도 불변)', () => {
    const round = pausedRound(300_000)
    expect(computeRemainingMs(round, NOW)).toBe(300_000)
    expect(computeRemainingMs(round, NOW + 600_000)).toBe(300_000)
  })

  it('총량을 넘겨도 음수로 내려가지 않는다', () => {
    expect(computeRemainingMs(runningRound(NOW, 1000), NOW + 5000)).toBe(0)
  })

  it('serverTimestamp 반영 전(앵커 null)에는 총량을 그대로 남은 시간으로 본다', () => {
    expect(computeRemainingMs(runningRound(null, 1_200_000), NOW + 60_000)).toBe(1_200_000)
  })
})

describe('formatRemaining', () => {
  it('mm:ss로 0을 채워 표기하고 초는 올림한다', () => {
    expect(formatRemaining(1_200_000)).toBe('20:00')
    // 올림이라 1ms만 지나도 20:00을 유지한다 — 시작 직후 19:59로 튀지 않게 하는 규칙
    expect(formatRemaining(1_199_001)).toBe('20:00')
    expect(formatRemaining(1_199_000)).toBe('19:59')
    expect(formatRemaining(62_000)).toBe('01:02')
    expect(formatRemaining(0)).toBe('00:00')
  })
})

describe('useRoundTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function mountTimer(round: Ref<RoundState | null>) {
    let timer!: ReturnType<typeof useRoundTimer>
    const wrapper = mount(
      defineComponent({
        setup() {
          timer = useRoundTimer(round)
          return () => h('span', timer.formatted.value)
        },
      }),
    )
    return { wrapper, timer: timer! }
  }

  it('1초 tick으로 카운트다운한다', async () => {
    const round = ref<RoundState | null>(runningRound(NOW, 1_200_000))
    const { wrapper, timer } = mountTimer(round)

    expect(timer.formatted.value).toBe('20:00')
    expect(timer.displayState.value).toBe('running')

    await vi.advanceTimersByTimeAsync(60_000)

    expect(timer.formatted.value).toBe('19:00')
    expect(wrapper.text()).toBe('19:00')
  })

  it('정지 중에는 시간이 흘러도 표시가 고정된다', async () => {
    const round = ref<RoundState | null>(pausedRound(300_000))
    const { timer } = mountTimer(round)

    await vi.advanceTimersByTimeAsync(30_000)

    expect(timer.formatted.value).toBe('05:00')
    expect(timer.displayState.value).toBe('paused')
  })

  it('0에 닿으면 종료로 판정한다 — 별도 쓰기 없이 클라이언트가 표시한다', async () => {
    const round = ref<RoundState | null>(runningRound(NOW, 3000))
    const { timer } = mountTimer(round)

    expect(timer.isEnded.value).toBe(false)

    await vi.advanceTimersByTimeAsync(4000)

    expect(timer.formatted.value).toBe('00:00')
    expect(timer.isEnded.value).toBe(true)
    expect(timer.displayState.value).toBe('ended')
  })

  it('라운드 시작 전에는 기본값 미리보기(20:00) + idle 상태다', () => {
    const { timer } = mountTimer(ref<RoundState | null>(null))

    expect(timer.formatted.value).toBe('20:00')
    expect(timer.displayState.value).toBe('idle')
    // 시작하지 않은 라운드는 종료된 것이 아니다
    expect(timer.isEnded.value).toBe(false)
  })

  it('화면 잠금으로 tick이 멈춰 있어도 복귀(visibilitychange) 시 즉시 재계산한다', () => {
    const round = ref<RoundState | null>(runningRound(NOW, 1_200_000))
    const { timer } = mountTimer(round)

    // 백그라운드 동안 인터벌이 돌지 않은 상황 — 시스템 시각만 5분 흐른다
    vi.setSystemTime(NOW + 300_000)
    expect(timer.formatted.value).toBe('20:00')

    document.dispatchEvent(new Event('visibilitychange'))

    expect(timer.formatted.value).toBe('15:00')
  })

  it('언마운트하면 인터벌과 이벤트 리스너를 정리한다', () => {
    const round = ref<RoundState | null>(runningRound(NOW, 1_200_000))
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { wrapper } = mountTimer(round)

    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()
  })
})
