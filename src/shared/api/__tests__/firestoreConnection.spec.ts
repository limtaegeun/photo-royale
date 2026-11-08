import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const disableNetworkMock = vi.fn<() => Promise<void>>()
const enableNetworkMock = vi.fn<() => Promise<void>>()
const getDocFromServerMock = vi.fn<(ref: { path: string }) => Promise<unknown>>()
type SnapshotListener = (snapshot: { metadata: { fromCache: boolean } }) => void
const onSnapshotMock = vi.fn<(ref: { path: string }, options: unknown, next: SnapshotListener, error: () => void) => () => void>()

vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  disableNetwork: () => disableNetworkMock(),
  enableNetwork: () => enableNetworkMock(),
  getDocFromServer: (ref: { path: string }) => getDocFromServerMock(ref),
  onSnapshot: (ref: { path: string }, options: unknown, next: SnapshotListener, error: () => void) =>
    onSnapshotMock(ref, options, next, error),
}))

const { isFirestoreReachable, restartFirestoreNetwork, watchFirestoreSynced } = await import('../firestoreConnection')

beforeEach(() => {
  disableNetworkMock.mockReset().mockResolvedValue()
  enableNetworkMock.mockReset().mockResolvedValue()
  getDocFromServerMock.mockReset()
  onSnapshotMock.mockReset().mockReturnValue(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('restartFirestoreNetwork', () => {
  it('연결을 끊은 뒤에 다시 연다', async () => {
    const order: string[] = []
    disableNetworkMock.mockImplementation(async () => {
      order.push('disable')
    })
    enableNetworkMock.mockImplementation(async () => {
      order.push('enable')
    })

    await restartFirestoreNetwork()

    expect(order).toEqual(['disable', 'enable'])
  })

  it('겹쳐 불러도 한 번만 돌고, 끝나면 다시 돌 수 있다', async () => {
    const first = restartFirestoreNetwork()
    const second = restartFirestoreNetwork()
    await Promise.all([first, second])
    expect(disableNetworkMock).toHaveBeenCalledTimes(1)

    await restartFirestoreNetwork()
    expect(disableNetworkMock).toHaveBeenCalledTimes(2)
  })

  it('실패해도 다음 호출을 막지 않는다', async () => {
    disableNetworkMock.mockRejectedValueOnce(new Error('boom'))
    await expect(restartFirestoreNetwork()).rejects.toThrow('boom')

    await restartFirestoreNetwork()
    expect(enableNetworkMock).toHaveBeenCalledTimes(1)
  })
})

describe('isFirestoreReachable', () => {
  it('서버가 답하면 true다. 가입으로 생길 수 없는 키를 읽는다', async () => {
    getDocFromServerMock.mockResolvedValue({})

    await expect(isFirestoreReachable(1000)).resolves.toBe(true)
    expect(getDocFromServerMock.mock.calls[0]![0].path).toBe('nicknames/__connection_probe__')
    expect(getDocFromServerMock.mock.calls[0]![0].path).not.toMatch(/\/[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/)
  })

  it('권한 오류도 서버의 답이라 true다', async () => {
    getDocFromServerMock.mockRejectedValue({ code: 'permission-denied' })

    await expect(isFirestoreReachable(1000)).resolves.toBe(true)
  })

  it('SDK가 오프라인이라고 하면 false다', async () => {
    getDocFromServerMock.mockRejectedValue({ code: 'unavailable' })

    await expect(isFirestoreReachable(1000)).resolves.toBe(false)
  })

  it('시간 안에 답이 없으면 false다', async () => {
    vi.useFakeTimers()
    getDocFromServerMock.mockReturnValue(new Promise(() => {}))

    const result = isFirestoreReachable(1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(result).resolves.toBe(false)
  })
})

describe('watchFirestoreSynced', () => {
  it('예약 ID 가 아닌 없는 문서를 메타데이터 변경까지 구독하고, 서버가 확인한(캐시가 아닌) 스냅샷에서만 알린다', () => {
    const onSynced = vi.fn<() => void>()
    const stop = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(stop)

    const unsubscribe = watchFirestoreSynced(onSynced)
    const [ref, options, next] = onSnapshotMock.mock.calls[0]!
    // `__…__` 꼴은 Firestore 예약 ID 라 구독이 invalid-argument 로 끝난다(2026-11-08 실측)
    expect(ref.path).toBe('nicknames/_connection_sync')
    expect(ref.path.split('/').pop()).not.toMatch(/^__.*__$/)
    expect(options).toEqual({ includeMetadataChanges: true })

    next({ metadata: { fromCache: true } })
    expect(onSynced).not.toHaveBeenCalled()
    next({ metadata: { fromCache: false } })
    expect(onSynced).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
