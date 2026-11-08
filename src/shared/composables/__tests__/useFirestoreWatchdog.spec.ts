import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  PROBE_INTERVAL_MS,
  PROBE_MAX_INTERVAL_MS,
  PROBE_RETRY_BASE_MS,
  PROBE_TIMEOUT_MS,
  RECONNECTING_NOTICE_DELAY_MS,
  RESUME_DEDUPE_MS,
  RESUME_FAST_PROBES,
  RESUME_PROBE_DELAY_MS,
  RESUME_PROBE_TIMEOUT_MS,
  RESUME_RESTART_MIN_HIDDEN_MS,
  UNHEALTHY_PROBE_INTERVAL_MS,
  useFirestoreWatchdog,
} from '../useFirestoreWatchdog'
import { useFirestoreConnectionStatus } from '../useFirestoreConnectionStatus'

const isFirestoreReachableMock = vi.fn<(timeoutMs: number) => Promise<boolean>>()
const restartFirestoreNetworkMock = vi.fn<() => Promise<void>>()

vi.mock('@/shared/api/firestoreConnection', () => ({
  isFirestoreReachable: (timeoutMs: number) => isFirestoreReachableMock(timeoutMs),
  restartFirestoreNetwork: () => restartFirestoreNetworkMock(),
}))

let visibility: DocumentVisibilityState = 'visible'
let wrapper: VueWrapper | null = null

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

async function hideFor(ms: number) {
  setVisibility('hidden')
  await vi.advanceTimersByTimeAsync(ms)
  setVisibility('visible')
}

const reconnecting = () => useFirestoreConnectionStatus().reconnecting.value

function mountWatchdog() {
  wrapper = mount(
    defineComponent({
      setup() {
        useFirestoreWatchdog()
        return () => h('div')
      },
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  isFirestoreReachableMock.mockReset().mockResolvedValue(true)
  restartFirestoreNetworkMock.mockReset().mockResolvedValue()
  useFirestoreConnectionStatus().setReconnecting(false)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useFirestoreWatchdog', () => {
  it('간격마다 응답을 확인하고, 살아 있으면 다시 열지 않는다', async () => {
    mountWatchdog()

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledExactlyOnceWith(PROBE_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(2)
    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()
  })

  it('응답이 없으면 연결을 새로 연다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    mountWatchdog()

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)

    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
  })

  it('응답이 없는 동안 점검은 3초마다 이어 가고, 새로 열기는 5·10·20·30초 간격으로 늘리되 상한을 넘기지 않는다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    const restartAt: number[] = []
    restartFirestoreNetworkMock.mockImplementation(async () => {
      restartAt.push(Date.now())
    })
    mountWatchdog()

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(restartAt).toHaveLength(1)
    const probesBefore = isFirestoreReachableMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(UNHEALTHY_PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(probesBefore + 1)

    await vi.advanceTimersByTimeAsync(150_000)
    const gaps = restartAt.slice(1).map((t, k) => t - restartAt[k]!)
    // 점검 간격(3초) 단위로 맞춰져 5→6초, 10→12초, 20→21초, 30→30초가 된다
    expect(gaps.slice(0, 5)).toEqual([6_000, 12_000, 21_000, PROBE_MAX_INTERVAL_MS, PROBE_MAX_INTERVAL_MS])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(PROBE_MAX_INTERVAL_MS)
    expect(PROBE_RETRY_BASE_MS).toBe(5_000)
  })

  it('응답이 없던 중에 연결이 살아나면 다음 점검(3초) 안에 연결 중을 내리고 평소 간격으로 돌아간다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    mountWatchdog()
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS + UNHEALTHY_PROBE_INTERVAL_MS * 5)
    expect(reconnecting()).toBe(true)

    isFirestoreReachableMock.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(UNHEALTHY_PROBE_INTERVAL_MS)
    expect(reconnecting()).toBe(false)

    const calls = isFirestoreReachableMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 1)
  })

  it('화면이 가려져 있으면 점검하지 않는다', async () => {
    mountWatchdog()
    setVisibility('hidden')

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 3)

    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
  })

  it('오래 가려졌다 돌아오면 바로 연결을 새로 열고, 1초 뒤 짧은 응답 대기로 확인한 다음 평소 간격으로 돌아간다', async () => {
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RESUME_PROBE_DELAY_MS - 1)
    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledExactlyOnceWith(RESUME_PROBE_TIMEOUT_MS)

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(PROBE_TIMEOUT_MS)
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
  })

  /** 2026-11-06 실측 — Safari 엔진은 새로 연 연결도 죽은 소켓 위에 있어서, 평소 간격을 기다리면 13~22초 늦었다 */
  it('돌아온 직후 응답이 없으면 1초 간격으로 다시 열고, 빠른 확인을 다 쓰면 3초마다 점검하며 새로 열기는 5초 간격부터 잇는다', async () => {
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    isFirestoreReachableMock.mockResolvedValue(false)

    for (let i = 1; i <= RESUME_FAST_PROBES; i += 1) {
      await vi.advanceTimersByTimeAsync(RESUME_PROBE_DELAY_MS)
      expect(isFirestoreReachableMock).toHaveBeenCalledTimes(i)
      expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(RESUME_PROBE_TIMEOUT_MS)
      expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1 + i)
    }

    await vi.advanceTimersByTimeAsync(UNHEALTHY_PROBE_INTERVAL_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(RESUME_FAST_PROBES)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(RESUME_FAST_PROBES + 1)
    expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(PROBE_TIMEOUT_MS)
    // 마지막 빠른 새로 열기에서 3초 — 5초가 안 돼 새로 열지 않는다
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1 + RESUME_FAST_PROBES)
    await vi.advanceTimersByTimeAsync(UNHEALTHY_PROBE_INTERVAL_MS)
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(2 + RESUME_FAST_PROBES)
  })

  it('빠른 확인이 응답을 받으면 남은 빠른 확인을 멈추고 평소 간격으로 돌아간다', async () => {
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    isFirestoreReachableMock.mockResolvedValueOnce(false).mockResolvedValue(true)

    await vi.advanceTimersByTimeAsync(RESUME_PROBE_DELAY_MS * 2)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(2)
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(3)
  })

  it('포커스가 오래 떠났다 돌아오면 연결을 새로 열고, 잠깐이면 건드리지 않는다', async () => {
    mountWatchdog()

    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(RESUME_RESTART_MIN_HIDDEN_MS - 1)
    window.dispatchEvent(new Event('focus'))
    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(RESUME_RESTART_MIN_HIDDEN_MS)
    window.dispatchEvent(new Event('focus'))
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RESUME_PROBE_DELAY_MS)
    expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(RESUME_PROBE_TIMEOUT_MS)
  })

  it('네트워크가 돌아오면 연결을 새로 열고, 화면이 가려져 있으면 돌아올 때로 미룬다', async () => {
    mountWatchdog()

    window.dispatchEvent(new Event('online'))
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RESUME_DEDUPE_MS)
    setVisibility('hidden')
    window.dispatchEvent(new Event('online'))
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
  })

  it('한 번의 복귀에 화면 복귀·포커스·온라인이 겹쳐 와도 연결은 한 번만 새로 연다', async () => {
    mountWatchdog()
    window.dispatchEvent(new Event('blur'))
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))

    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
  })

  it('새로 연 뒤 응답이 바로 확인되면 연결 중을 띄우지 않는다', async () => {
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)

    await vi.advanceTimersByTimeAsync(RECONNECTING_NOTICE_DELAY_MS * 2)

    expect(reconnecting()).toBe(false)
  })

  it('새로 연 뒤 응답이 늦으면 연결 중을 띄우고, 응답이 확인되면 내린다', async () => {
    let answer: (value: boolean) => void = () => {}
    isFirestoreReachableMock.mockImplementation(() => new Promise<boolean>((resolve) => (answer = resolve)))
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)

    await vi.advanceTimersByTimeAsync(RECONNECTING_NOTICE_DELAY_MS - 1)
    expect(reconnecting()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(reconnecting()).toBe(true)

    answer(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(reconnecting()).toBe(false)
  })

  it('점검이 응답 없음을 확인하면 연결 중을 띄우고, 화면을 떠나면 내린다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    mountWatchdog()

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(reconnecting()).toBe(true)

    wrapper?.unmount()
    wrapper = null
    expect(reconnecting()).toBe(false)
  })

  it('잠깐 가려졌다 돌아오면 연결을 건드리지 않는다', async () => {
    mountWatchdog()
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(RESUME_RESTART_MIN_HIDDEN_MS - 1)

    setVisibility('visible')

    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()
  })

  it('뒤로 가기 캐시에서 돌아오면 연결을 새로 연다', () => {
    mountWatchdog()

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)
  })

  it('화면을 떠나면 점검과 이벤트 처리를 멈춘다', async () => {
    mountWatchdog()
    wrapper?.unmount()
    wrapper = null

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 2)
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(RESUME_RESTART_MIN_HIDDEN_MS)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))

    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()
  })
})
