import { describe, it, expect, beforeEach } from 'vitest'
import { observeRoundAnchor, resetServerClock, serverClockOffsetMs, serverNow } from '../serverClock'

/** 기기 시각 — 테스트는 "기기가 서버보다 얼마나 앞서 있나"를 이 값으로 만든다 */
const DEVICE_NOW = new Date('2026-08-31T10:00:00Z').getTime()
const MINUTE = 60_000

beforeEach(() => {
  resetServerClock()
})

describe('observeRoundAnchor', () => {
  it('구독의 첫 스냅샷은 샘플로 쓰지 않는다 — 진행 중인 라운드에 합류하면 앵커가 과거다', () => {
    // 21분 전에 시작된 라운드에 지금 합류했다. 이걸 샘플로 쓰면 기기가 21분 빠른 것으로 오판한다
    observeRoundAnchor(DEVICE_NOW - 21 * MINUTE, false, DEVICE_NOW)

    expect(serverClockOffsetMs()).toBeNull()
    expect(serverNow()).toBe(Date.now())
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
