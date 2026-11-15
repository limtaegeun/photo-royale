import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { CAMERA_PARK_LIMIT_MS, useCameraStreamStore } from '../stores/useCameraStreamStore'

function createFakeStream() {
  const listeners: Record<string, () => void> = {}
  const createFakeTrack = () => ({
    readyState: 'live' as MediaStreamTrackState,
    enabled: true,
    stop: vi.fn<() => void>(),
    applyConstraints: vi.fn<(constraints: MediaTrackConstraints) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    addEventListener: vi.fn<(event: string, handler: () => void) => void>(
      (event, handler) => (listeners[event] = handler),
    ),
  })
  const tracks = [createFakeTrack()]
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream
  /** OS 회수 등 외부 요인으로 비디오 트랙이 끝난 상황을 시뮬레이션한다 */
  const fireVideoTrackEnded = () => {
    tracks[0]!.readyState = 'ended'
    listeners.ended?.()
  }
  return { stream, tracks, fireVideoTrackEnded }
}

function stubGetUserMedia(
  impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
) {
  const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  return getUserMedia
}

const COCKPIT_RESTORE = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
const PARKED = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 1 } }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('useCameraStreamStore 권한·상태', () => {
  it('acquire 성공 시 active 상태가 되고 후면 카메라 스트림을 콕핏 화질로 연다', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()

    await store.acquire('ABCD')

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    expect(store.status).toBe('active')
    expect(store.stream).toBe(stream)
    expect(store.roomCode).toBe('ABCD')
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['OverconstrainedError', 'unavailable'],
    ['NotReadableError', 'error'],
  ])('%s 이면 %s 상태가 되고 방을 쥐지 않는다', async (name, expected) => {
    stubGetUserMedia(() => Promise.reject(new DOMException('fail', name)))
    const store = useCameraStreamStore()

    await store.acquire('ABCD')

    expect(store.status).toBe(expected)
    expect(store.roomCode).toBeNull()
  })

  it('mediaDevices API가 없으면 unavailable 상태가 된다', async () => {
    const store = useCameraStreamStore()

    await store.acquire('ABCD')

    expect(store.status).toBe('unavailable')
  })

  it('거부 뒤 다시 acquire하면 권한을 다시 요청한다(다시 시도 버튼)', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = stubGetUserMedia(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    )
    const store = useCameraStreamStore()
    await store.acquire('ABCD')

    getUserMedia.mockResolvedValueOnce(stream)
    await store.acquire('ABCD')

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(store.status).toBe('active')
  })

  it('release 시 모든 트랙을 정지하고 idle로 돌아간다', async () => {
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')

    store.release()

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
    expect(store.status).toBe('idle')
    expect(store.stream).toBeNull()
    expect(store.roomCode).toBeNull()
  })
})

describe('useCameraStreamStore 방 단위 유지', () => {
  it('park하면 정지하지 않고 최저 화질로 낮춘 뒤 트랙을 꺼 둔다', async () => {
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')

    store.park()

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith(PARKED)
    expect(tracks[0]!.enabled).toBe(false)
    expect(store.status).toBe('active')
    expect(store.stream).toBe(stream)
  })

  it('같은 방에서 다시 acquire하면 권한을 다시 묻지 않고 트랙을 켜서 콕핏 화질·프레임률로 되돌려 쓴다', async () => {
    const { stream, tracks } = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()

    await store.acquire('ABCD')

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(tracks[0]!.enabled).toBe(true)
    expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith(COCKPIT_RESTORE)
    expect(store.stream).toBe(stream)
    expect(store.status).toBe('active')
  })

  it('콕핏 밖에서 30분이 지나면 끈다', async () => {
    vi.useFakeTimers()
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()

    vi.advanceTimersByTime(CAMERA_PARK_LIMIT_MS - 1)
    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(tracks[0]!.stop).toHaveBeenCalledOnce()
    expect(store.status).toBe('idle')
  })

  it('30분 전에 콕핏으로 돌아오면 끄는 예약을 취소한다', async () => {
    vi.useFakeTimers()
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()
    vi.advanceTimersByTime(CAMERA_PARK_LIMIT_MS - 1000)

    await store.acquire('ABCD')
    vi.advanceTimersByTime(CAMERA_PARK_LIMIT_MS)

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    expect(store.status).toBe('active')
  })

  it('다른 방에서 acquire하면 쥐고 있던 스트림을 끄고 새로 요청한다', async () => {
    const first = createFakeStream()
    const second = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(first.stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()

    getUserMedia.mockResolvedValueOnce(second.stream)
    await store.acquire('WXYZ')

    expect(first.tracks[0]!.stop).toHaveBeenCalledOnce()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(store.stream).toBe(second.stream)
    expect(store.roomCode).toBe('WXYZ')
  })

  it('쥐고 있던 트랙이 끝났으면(OS 회수) 같은 방이어도 새로 요청한다', async () => {
    const first = createFakeStream()
    const second = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(first.stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()
    first.tracks[0]!.readyState = 'ended'

    getUserMedia.mockResolvedValueOnce(second.stream)
    await store.acquire('ABCD')

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(store.stream).toBe(second.stream)
  })

  it('콕핏에서 트랙이 외부 요인으로 끝나면(ended) error 상태가 되어 재시도를 유도한다', async () => {
    const { stream, tracks, fireVideoTrackEnded } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')

    fireVideoTrackEnded()

    expect(store.status).toBe('error')
    expect(store.stream).toBeNull()
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })

  it('콕핏 밖에서 트랙이 끝나면 조용히 버린다(재시도 UI 없음)', async () => {
    const { stream, fireVideoTrackEnded } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const store = useCameraStreamStore()
    await store.acquire('ABCD')
    store.park()

    fireVideoTrackEnded()

    expect(store.status).toBe('idle')
    expect(store.stream).toBeNull()
  })

  it('권한 응답 대기 중 놓으면(방 이탈) 늦게 도착한 스트림을 즉시 정지한다', async () => {
    const { stream, tracks } = createFakeStream()
    let resolveMedia!: (stream: MediaStream) => void
    stubGetUserMedia(() => new Promise((resolve) => (resolveMedia = resolve)))
    const store = useCameraStreamStore()

    const pending = store.acquire('ABCD')
    store.release()
    resolveMedia(stream)
    await pending

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
    expect(store.stream).toBeNull()
    expect(store.status).toBe('idle')
  })

  it('권한 응답 대기 중 콕핏을 나가면(park) 도착한 스트림을 저화질로 쥐어 둔다', async () => {
    const { stream, tracks } = createFakeStream()
    let resolveMedia!: (stream: MediaStream) => void
    stubGetUserMedia(() => new Promise((resolve) => (resolveMedia = resolve)))
    const store = useCameraStreamStore()

    const pending = store.acquire('ABCD')
    store.park()
    resolveMedia(stream)
    await pending

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith(PARKED)
    expect(store.stream).toBe(stream)
  })

  it('권한 응답 대기 중 같은 방에서 다시 acquire해도 요청을 겹쳐 보내지 않는다', async () => {
    const { stream } = createFakeStream()
    let resolveMedia!: (stream: MediaStream) => void
    const getUserMedia = stubGetUserMedia(
      () => new Promise((resolve) => (resolveMedia = resolve)),
    )
    const store = useCameraStreamStore()

    const pending = store.acquire('ABCD')
    await store.acquire('ABCD')
    resolveMedia(stream)
    await pending

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(store.status).toBe('active')
  })
})
