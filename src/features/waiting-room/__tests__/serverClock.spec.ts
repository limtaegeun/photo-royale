import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRoundAnchorObserver,
  probeServerClock,
  resetServerClock,
  serverClockOffsetMs,
  serverNow,
  type RoundAnchorObserver,
} from '../serverClock'

/** 기기 시각 — 테스트는 "기기가 서버보다 얼마나 앞서 있나"를 이 값으로 만든다 */
const DEVICE_NOW = new Date('2026-08-31T10:00:00Z').getTime()
const MINUTE = 60_000

/** 테스트 하나 = 구독 하나. 관측 이력은 구독마다 새로 시작한다 */
let observeRoundAnchor: RoundAnchorObserver

/** HTTP Date 프로브 — 기본은 오프라인(실패)이라 기존 관측 테스트에 끼어들지 않는다 */
const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  fetchMock.mockReset().mockRejectedValue(new TypeError('Failed to fetch'))
  vi.stubGlobal('fetch', fetchMock)
  resetServerClock()
  observeRoundAnchor = createRoundAnchorObserver()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function dateResponse(serverMs: number, ageSeconds?: number): Response {
  const headers = new Headers({ date: new Date(serverMs).toUTCString() })
  if (ageSeconds !== undefined) headers.set('age', String(ageSeconds))
  return new Response(null, { status: 200, headers })
}

/**
 * 10/28 최종 QA D5 — 진행 중 라운드에 새 탭으로 들어오면 첫 스냅샷은 샘플이 아니라서, 진행자의 다음
 * 전이까지 기기 시계를 그대로 썼다. 시계가 5분 빠른 폰은 혼자 라운드가 먼저 끝났다.
 */
describe('probeServerClock (HTTP Date)', () => {
  it('아직 못 쟀으면 첫 스냅샷에서 같은 출처 HEAD 를 보내 Date 헤더로 잰다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_NOW)
    try {
      // 기기가 서버보다 5분 빠르다 — 서버 Date 는 5분 전
      fetchMock.mockResolvedValueOnce(dateResponse(DEVICE_NOW - 5 * MINUTE))

      observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)
      // 관측자는 프로브를 기다리지 않는다(void) — 응답 처리 마이크로태스크만 비운다(시계는 고정)
      for (let tick = 0; tick < 5; tick++) await Promise.resolve()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toMatch(/^\/\?clock-probe=\d+$/)
      expect(init).toMatchObject({ method: 'HEAD', cache: 'no-store' })
      expect(serverClockOffsetMs()).toBe(-5 * MINUTE)
      expect(serverNow()).toBe(DEVICE_NOW - 5 * MINUTE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('캐시를 거친 응답이면 Age 만큼 더한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_NOW)
    try {
      fetchMock.mockResolvedValueOnce(dateResponse(DEVICE_NOW - 5 * MINUTE - 30_000, 30))

      await probeServerClock()

      expect(serverClockOffsetMs()).toBe(-5 * MINUTE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('이미 잰 보정이 있으면 프로브를 보내지 않는다', async () => {
    observeRoundAnchor(null, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW - 2 * MINUTE, false, DEVICE_NOW) // 시작을 함께 봤다 → 기기 2분 빠름
    await Promise.resolve()
    fetchMock.mockClear()

    await probeServerClock()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(serverClockOffsetMs()).toBe(-2 * MINUTE)
  })

  it('프로브가 전이 샘플보다 작으면 전이 샘플로 바뀐다 — 가장 큰 값 규칙', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_NOW)
    try {
      // Date 는 초 단위로 잘려 참값보다 최대 1초 작다
      fetchMock.mockResolvedValueOnce(dateResponse(DEVICE_NOW - 5 * MINUTE - 900))
      await probeServerClock()
      expect(serverClockOffsetMs()).toBe(-5 * MINUTE - 1_000)

      observeRoundAnchor(null, false, DEVICE_NOW)
      observeRoundAnchor(DEVICE_NOW - 5 * MINUTE - 100, false, DEVICE_NOW)

      expect(serverClockOffsetMs()).toBe(-5 * MINUTE - 100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('실패하면 보정 없이 두고 다음 기회에 다시 보낸다', async () => {
    await probeServerClock()
    expect(serverClockOffsetMs()).toBeNull()

    fetchMock.mockResolvedValueOnce(dateResponse(Date.now() - 5 * MINUTE))
    await probeServerClock()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(serverClockOffsetMs()).not.toBeNull()
  })

  it('2초 미만 차이는 보정하지 않는다 — 초 단위 Date 로는 맞는 시계와 가를 수 없다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_NOW)
    try {
      fetchMock.mockResolvedValueOnce(dateResponse(DEVICE_NOW - 900))

      await probeServerClock()

      expect(serverClockOffsetMs()).toBeNull()
      expect(serverNow()).toBe(DEVICE_NOW)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Date 헤더가 없으면 재지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await probeServerClock()

    expect(serverClockOffsetMs()).toBeNull()
  })
})

describe('observeRoundAnchor', () => {
  it('구독의 첫 스냅샷은 샘플로 쓰지 않는다 — 진행 중인 라운드에 합류하면 앵커가 과거다', () => {
    // Date.now()를 두 번 따로 읽으면(serverNow() 내부 1회 + 검증 1회) 부하 상황에서 1ms
    // 어긋나 flaky해진다. 시계를 고정해 두 호출이 항상 같은 값을 읽게 한다
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_NOW)
    try {
      // 21분 전에 시작된 라운드에 지금 합류했다. 이걸 샘플로 쓰면 기기가 21분 빠른 것으로 오판한다
      observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)

      expect(serverClockOffsetMs()).toBeNull()
      expect(serverNow()).toBe(Date.now())
    } finally {
      vi.useRealTimers()
    }
  })

  it('앵커가 바뀐 순간을 서버 시각으로 삼아 기기 시계와의 차를 잰다', () => {
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)
    // 진행자가 라운드를 다시 걸었다 — 서버가 방금 찍은 시각이다.
    // 기기는 서버보다 15분 앞서 있으므로 서버가 찍은 값은 기기 시각보다 15분 뒤처져 보인다
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, false, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBe(-15 * MINUTE)
  })

  it('같은 앵커가 다시 와도(재전송·재구독) 샘플로 세지 않는다', () => {
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, false, DEVICE_NOW + 5 * MINUTE)

    expect(serverClockOffsetMs()).toBe(-15 * MINUTE)
  })

  it('캐시에서 나온 스냅샷은 샘플로 쓰지 않는다 — 서버가 방금 확인해 준 값이 아니다', () => {
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, true, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBeNull()
  })

  it('늦게 도착한 스냅샷은 오프셋을 실제보다 작게 만들므로 가장 큰 샘플을 채택한다', () => {
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)
    // 정상 관측: 기기가 15분 빠르다
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, false, DEVICE_NOW)
    // 오프라인에서 5분 뒤 복구돼 밀린 스냅샷이 도착했다 — 그대로 쓰면 20분 빠른 것으로 오판한다
    observeRoundAnchor(DEVICE_NOW - 14 * MINUTE, false, DEVICE_NOW + 6 * MINUTE)

    expect(serverClockOffsetMs()).toBe(-15 * MINUTE)
  })

  it('더 지연이 적은 관측이 오면 그쪽으로 갱신한다', () => {
    observeRoundAnchor(DEVICE_NOW, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW - 10 * MINUTE, false, DEVICE_NOW + 12 * MINUTE) // 늦은 관측(-22분)
    observeRoundAnchor(DEVICE_NOW - 9 * MINUTE, false, DEVICE_NOW + 12 * MINUTE) // 덜 늦음(-21분)

    expect(serverClockOffsetMs()).toBe(-21 * MINUTE)
  })

  it('⭐ 대기실에서 라운드 시작을 함께 보면 그 순간이 샘플이다 — 정상 동선의 보정 지점', () => {
    // 게스트는 라운드가 걸리기 전 대기실에 있다(round 없음 = 앵커 null)
    observeRoundAnchor(null, false, DEVICE_NOW)
    // 진행자가 '라운드 시작'을 누르면 서버가 지금 시각을 찍는다.
    // 기기가 15분 앞서 있으므로 서버 값은 기기 시각보다 15분 뒤처져 보인다
    observeRoundAnchor(DEVICE_NOW - 15 * MINUTE, false, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBe(-15 * MINUTE)
  })

  it('라운드가 끝났다 다시 시작돼도 그 전이를 샘플로 잡는다', () => {
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW) // 합류(첫 스냅샷 — 샘플 아님)
    observeRoundAnchor(null, false, DEVICE_NOW) // 진행자가 게임 종료
    observeRoundAnchor(DEVICE_NOW - 3 * MINUTE, false, DEVICE_NOW) // 다음 라운드 시작

    expect(serverClockOffsetMs()).toBe(-3 * MINUTE)
  })

  it('방을 갈아타 새 구독이 열리면 그 첫 스냅샷도 샘플이 아니다', () => {
    // 앞 방에서는 라운드가 없어 앵커를 한 번도 못 봤다
    observeRoundAnchor(null, false, DEVICE_NOW)

    // 다른 방으로 옮겨 새로 구독한다 — 21분 전에 시작된 라운드가 이미 돌고 있다.
    // 이전 구독의 이력을 이어 쓰면 이 과거 앵커가 '구독 중의 변화'로 보여 샘플이 된다
    const nextSubscription = createRoundAnchorObserver()
    nextSubscription(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBeNull()
  })

  it('serverTimestamp 반영 전(앵커 null) 스냅샷만 이어지면 잴 것이 없다', () => {
    observeRoundAnchor(null, false, DEVICE_NOW)
    observeRoundAnchor(null, false, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBeNull()
  })
})

describe('serverNow', () => {
  it('보정을 못 쟀으면 기기 시각을 그대로 쓴다', () => {
    expect(serverNow()).toBeCloseTo(Date.now(), -2)
  })

  it('보정을 쟀으면 그만큼 기기 시각을 밀어 서버 기준으로 돌려준다', () => {
    observeRoundAnchor(DEVICE_NOW, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW + 1, false, DEVICE_NOW + 15 * MINUTE + 1)

    expect(serverClockOffsetMs()).toBe(-15 * MINUTE)
    expect(serverNow()).toBeCloseTo(Date.now() - 15 * MINUTE, -2)
  })

  it('새로고침(모듈 재시작)에도 세션 안에서는 보정이 유지된다', () => {
    observeRoundAnchor(DEVICE_NOW, false, DEVICE_NOW)
    observeRoundAnchor(DEVICE_NOW + 1, false, DEVICE_NOW + 15 * MINUTE + 1)
    expect(sessionStorage.getItem('pr:server-clock-offset')).toBe(String(-15 * MINUTE))
  })
})
