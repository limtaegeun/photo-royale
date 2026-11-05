import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

interface FakeVenueMap {
  image: string | null
  version: string | null
}

const fetchVersionMock = vi.fn<(code: string) => Promise<string | null>>()
const fetchMapMock = vi.fn<(code: string) => Promise<FakeVenueMap | null>>()

vi.mock('../api/venueMap', () => ({
  fetchVenueMapVersion: (code: string) => fetchVersionMock(code),
  fetchVenueMap: (code: string) => fetchMapMock(code),
}))

import {
  VENUE_MAP_CHECK_INTERVAL_MS,
  VENUE_MAP_RETRY_INTERVAL_MS,
  useVenueMapStore,
} from '../stores/useVenueMapStore'

const MAP_A = 'data:image/jpeg;base64,map-a'
const MAP_B = 'data:image/jpeg;base64,map-b'

/** 서버에 지금 올라 있는 지도를 정한다 */
function serverHas(image: string, version: string) {
  fetchVersionMock.mockResolvedValue(version)
  fetchMapMock.mockResolvedValue({ image, version })
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  fetchVersionMock.mockReset()
  fetchMapMock.mockReset()
})

afterEach(() => {
  useVenueMapStore().stop()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useVenueMapStore', () => {
  it('방 지도를 내려받아 들고 있는다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()

    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    expect(store.roomCode).toBe('AB2C')
    expect(store.image).toBe(MAP_A)
    expect(fetchMapMock).toHaveBeenCalledExactlyOnceWith('AB2C')
  })

  it('등록 전인 방은 내려받지 않고 null로 둔다', async () => {
    fetchVersionMock.mockResolvedValue(null)
    const store = useVenueMapStore()

    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    expect(store.image).toBeNull()
    expect(fetchMapMock).not.toHaveBeenCalled()
  })

  it('같은 방을 다시 추적해도 다시 내려받지 않는다 — 대기실 → 콕핏 이동', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMapMock).toHaveBeenCalledTimes(1)
    expect(store.image).toBe(MAP_A)
  })

  it('판이 같으면 내려받지 않고, 바뀌면 간격 안에 새 지도를 받는다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS)
    expect(fetchVersionMock).toHaveBeenCalledTimes(2)
    expect(fetchMapMock).toHaveBeenCalledTimes(1)

    serverHas(MAP_B, 'v2')
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS)

    expect(fetchMapMock).toHaveBeenCalledTimes(2)
    expect(store.image).toBe(MAP_B)
  })

  it('지도가 지워지면 비운다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    fetchVersionMock.mockResolvedValue(null)
    await store.refresh()

    expect(store.image).toBeNull()
  })

  it('받기에 실패하면 받아 둔 지도를 그대로 두고 다음 확인에서 받는다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    fetchVersionMock.mockRejectedValue(new Error('network'))
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS)
    expect(store.image).toBe(MAP_A)

    serverHas(MAP_B, 'v2')
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS)
    expect(store.image).toBe(MAP_B)
  })

  it('한 번도 받지 못했으면 더 짧은 간격으로 다시 시도한다', async () => {
    fetchVersionMock.mockRejectedValueOnce(new Error('network'))
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.image).toBeNull()

    serverHas(MAP_A, 'v1')
    await vi.advanceTimersByTimeAsync(VENUE_MAP_RETRY_INTERVAL_MS)

    expect(store.image).toBe(MAP_A)
  })

  it('화면이 가려져 있으면 확인하지 않고, 돌아오면 바로 확인한다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)
    fetchVersionMock.mockClear()

    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS * 2)
    expect(fetchVersionMock).not.toHaveBeenCalled()

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchVersionMock).toHaveBeenCalledTimes(1)
  })

  it('다른 방을 추적하면 이전 지도를 버리고, 늦게 온 이전 방 응답은 무시한다', async () => {
    let resolveOld: (version: string) => void = () => {}
    fetchVersionMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    const store = useVenueMapStore()
    store.track('AB2C')

    serverHas(MAP_B, 'v9')
    store.track('XY9Z')
    resolveOld('v1')
    await vi.advanceTimersByTimeAsync(0)
    await store.refresh()

    expect(store.roomCode).toBe('XY9Z')
    expect(store.image).toBe(MAP_B)
  })

  it('호스트가 방금 저장한 지도는 바로 쓰고 다시 내려받지 않는다', async () => {
    fetchVersionMock.mockResolvedValue(null)
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)

    fetchVersionMock.mockResolvedValue('v2')
    await store.adoptSaved(MAP_A)
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS)

    expect(store.image).toBe(MAP_A)
    expect(fetchMapMock).not.toHaveBeenCalled()
  })

  it('멈추면 지도를 버리고 더 확인하지 않는다', async () => {
    serverHas(MAP_A, 'v1')
    const store = useVenueMapStore()
    store.track('AB2C')
    await vi.advanceTimersByTimeAsync(0)
    fetchVersionMock.mockClear()

    store.stop()
    await vi.advanceTimersByTimeAsync(VENUE_MAP_CHECK_INTERVAL_MS * 2)

    expect(store.roomCode).toBeNull()
    expect(store.image).toBeNull()
    expect(fetchVersionMock).not.toHaveBeenCalled()
  })
})
