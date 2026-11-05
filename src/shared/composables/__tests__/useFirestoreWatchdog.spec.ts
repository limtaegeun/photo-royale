import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  PROBE_INTERVAL_MS,
  PROBE_MAX_INTERVAL_MS,
  PROBE_RETRY_BASE_MS,
  PROBE_TIMEOUT_MS,
  RESUME_RESTART_MIN_HIDDEN_MS,
  useFirestoreWatchdog,
} from '../useFirestoreWatchdog'

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

  it('실패 뒤에는 빨리 다시 확인하고, 이어지면 간격을 늘리되 상한을 넘기지 않으며, 살아나면 원래 간격으로 돌아간다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    mountWatchdog()

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(1)

    // 5초 · 10초 · 20초 · 30초(상한) · 30초
    let calls = 1
    for (const delay of [
      PROBE_RETRY_BASE_MS,
      PROBE_RETRY_BASE_MS * 2,
      PROBE_RETRY_BASE_MS * 4,
      PROBE_MAX_INTERVAL_MS,
      PROBE_MAX_INTERVAL_MS,
    ]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls)
      await vi.advanceTimersByTimeAsync(1)
      calls += 1
      expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls)
    }

    isFirestoreReachableMock.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(PROBE_MAX_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 1)
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 2)
  })

  it('화면이 가려져 있으면 점검하지 않는다', async () => {
    mountWatchdog()
    setVisibility('hidden')

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 3)

    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
  })

  it('오래 가려졌다 돌아오면 바로 연결을 새로 열고 점검을 이어 간다', async () => {
    mountWatchdog()
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(RESUME_RESTART_MIN_HIDDEN_MS)

    setVisibility('visible')
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(1)
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
    setVisibility('hidden')
    setVisibility('visible')

    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
    expect(restartFirestoreNetworkMock).not.toHaveBeenCalled()
  })
})
