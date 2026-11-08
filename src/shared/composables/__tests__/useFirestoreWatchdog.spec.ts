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
  useFirestoreWatchdog,
} from '../useFirestoreWatchdog'
import { useFirestoreConnectionStatus } from '../useFirestoreConnectionStatus'

const isFirestoreReachableMock = vi.fn<(timeoutMs: number) => Promise<boolean>>()
const restartFirestoreNetworkMock = vi.fn<() => Promise<void>>()
const stopWatchingSyncedMock = vi.fn<() => void>()
let onSynced: (() => void) | null = null

vi.mock('@/shared/api/firestoreConnection', () => ({
  isFirestoreReachable: (timeoutMs: number) => isFirestoreReachableMock(timeoutMs),
  restartFirestoreNetwork: () => restartFirestoreNetworkMock(),
  watchFirestoreSynced: (callback: () => void) => {
    onSynced = callback
    return stopWatchingSyncedMock
  },
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
  stopWatchingSyncedMock.mockReset()
  onSynced = null
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

    // 5초 · 10초 · 20초 · 30초(상한) · 30초 — 점검이 실패할 때마다 연결을 새로 연다
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
    expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(calls)

    isFirestoreReachableMock.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(PROBE_MAX_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 1)
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 2)
  })

  /** 2026-11-08 실측 — 점검 간격대로만 확인하면 연결이 살아난 뒤에도 '연결 중'이 최대 30초 남았다 */
  it('응답이 없던 중에 서버와 다시 맞춰지면(구독 스냅샷) 바로 연결 중을 내리고 평소 간격으로 돌아간다', async () => {
    isFirestoreReachableMock.mockResolvedValue(false)
    mountWatchdog()
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS + PROBE_RETRY_BASE_MS)
    expect(reconnecting()).toBe(true)

    onSynced?.()
    expect(reconnecting()).toBe(false)

    const calls = isFirestoreReachableMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(calls + 1)
  })

  it('평소의 구독 스냅샷은 점검 주기를 건드리지 않는다', async () => {
    mountWatchdog()
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS - 1000)
    onSynced?.()
    await vi.advanceTimersByTimeAsync(1000)

    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(1)
  })

  it('돌아와서 새로 연 뒤 서버와 맞춰지면 남은 빠른 확인을 하지 않고 연결 중도 띄우지 않는다', async () => {
    isFirestoreReachableMock.mockImplementation(() => new Promise<boolean>(() => {}))
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)

    await vi.advanceTimersByTimeAsync(500)
    onSynced?.()
    await vi.advanceTimersByTimeAsync(RECONNECTING_NOTICE_DELAY_MS * 2)

    expect(reconnecting()).toBe(false)
    expect(isFirestoreReachableMock).not.toHaveBeenCalled()
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
  it('돌아온 직후 응답이 없으면 1초 간격으로 다시 열고, 빠른 확인을 다 쓰면 평소 재시도 첫 간격(5초)으로 잇는다', async () => {
    mountWatchdog()
    await hideFor(RESUME_RESTART_MIN_HIDDEN_MS)
    isFirestoreReachableMock.mockResolvedValue(false)

    for (let i = 1; i <= RESUME_FAST_PROBES; i += 1) {
      await vi.advanceTimersByTimeAsync(RESUME_PROBE_DELAY_MS)
      expect(isFirestoreReachableMock).toHaveBeenCalledTimes(i)
      expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(RESUME_PROBE_TIMEOUT_MS)
      expect(restartFirestoreNetworkMock).toHaveBeenCalledTimes(1 + i)
    }

    await vi.advanceTimersByTimeAsync(PROBE_RETRY_BASE_MS - 1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(RESUME_FAST_PROBES)
    await vi.advanceTimersByTimeAsync(1)
    expect(isFirestoreReachableMock).toHaveBeenCalledTimes(RESUME_FAST_PROBES + 1)
    expect(isFirestoreReachableMock).toHaveBeenLastCalledWith(PROBE_TIMEOUT_MS)
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
    expect(stopWatchingSyncedMock).toHaveBeenCalledTimes(1)
  })
})
