import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

type OnChange = (image: string | null) => void
type OnError = (error: Error) => void

const unsubscribeMock = vi.fn<() => void>()
const subscribeMock = vi.fn<(code: string, onChange: OnChange, onError?: OnError) => () => void>()

vi.mock('../api/venueMap', () => ({
  subscribeToVenueMapImage: (code: string, onChange: OnChange, onError?: OnError) =>
    subscribeMock(code, onChange, onError),
}))

import { useVenueMapStore } from '../stores/useVenueMapStore'

const MAP_A = 'data:image/jpeg;base64,map-a'
const MAP_B = 'data:image/jpeg;base64,map-b'

/** n번째 구독에 넘긴 콜백 — 테스트가 스냅샷·오류를 흉내 낸다 */
function listener(n = 0) {
  const [, onChange, onError] = subscribeMock.mock.calls[n]!
  return { onChange, onError: onError! }
}

beforeEach(() => {
  setActivePinia(createPinia())
  unsubscribeMock.mockReset()
  subscribeMock.mockReset().mockReturnValue(unsubscribeMock)
})

describe('useVenueMapStore', () => {
  it('방 지도를 받기 시작하고, 받은 지도를 들고 있는다', () => {
    const store = useVenueMapStore()

    store.track('AB2C')
    listener().onChange(MAP_A)

    expect(subscribeMock).toHaveBeenCalledExactlyOnceWith('AB2C', expect.any(Function), expect.any(Function))
    expect(store.roomCode).toBe('AB2C')
    expect(store.image).toBe(MAP_A)
  })

  it('같은 방을 다시 추적하면(대기실 → 콕핏) 다시 구독하지 않고 받아 둔 지도를 그대로 쓴다', () => {
    const store = useVenueMapStore()
    store.track('AB2C')
    listener().onChange(MAP_A)

    store.track('AB2C')

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeMock).not.toHaveBeenCalled()
    expect(store.image).toBe(MAP_A)
  })

  it('진행자가 지도를 바꾸면 새 지도로 바뀐다', () => {
    const store = useVenueMapStore()
    store.track('AB2C')
    listener().onChange(MAP_A)

    listener().onChange(MAP_B)

    expect(store.image).toBe(MAP_B)
  })

  it('다른 방을 추적하면 이전 구독을 내리고 이전 방 지도를 버린다', () => {
    const store = useVenueMapStore()
    store.track('AB2C')
    listener().onChange(MAP_A)

    store.track('XY9Z')

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(subscribeMock).toHaveBeenLastCalledWith('XY9Z', expect.any(Function), expect.any(Function))
    expect(store.roomCode).toBe('XY9Z')
    expect(store.image).toBeNull()
  })

  it('구독이 오류로 끊겨도 받아 둔 지도는 남고, 같은 방을 다시 추적하면 다시 구독한다', () => {
    const store = useVenueMapStore()
    store.track('AB2C')
    listener().onChange(MAP_A)

    listener().onError(new Error('permission-denied'))
    expect(store.image).toBe(MAP_A)

    store.track('AB2C')
    expect(subscribeMock).toHaveBeenCalledTimes(2)
    expect(store.image).toBe(MAP_A)
  })

  it('stop은 구독을 내리고 지도를 비운다', () => {
    const store = useVenueMapStore()
    store.track('AB2C')
    listener().onChange(MAP_A)

    store.stop()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(store.roomCode).toBeNull()
    expect(store.image).toBeNull()
  })
})
