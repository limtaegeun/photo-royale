import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useCameraStream } from '../composables/useCameraStream'

function createFakeStream() {
  const listeners: Record<string, () => void> = {}
  const createFakeTrack = () => ({
    stop: vi.fn<() => void>(),
    addEventListener: vi.fn<(event: string, handler: () => void) => void>(
      (event, handler) => (listeners[event] = handler),
    ),
  })
  const tracks = [createFakeTrack(), createFakeTrack()]
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream
  /** OS 회수 등 외부 요인으로 비디오 트랙이 끝난 상황을 시뮬레이션한다 */
  const fireVideoTrackEnded = () => listeners.ended?.()
  return { stream, tracks, fireVideoTrackEnded }
}

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  return getUserMedia
}

function setupInScope() {
  const scope = effectScope()
  const camera = scope.run(() => useCameraStream())!
  return { scope, camera }
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('useCameraStream', () => {
  it('start 성공 시 active 상태가 되고 후면 카메라 스트림을 보유한다', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(stream))
    const { camera } = setupInScope()

    await camera.start()

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    })
    expect(camera.status.value).toBe('active')
    expect(camera.stream.value).toBe(stream)
  })

  it('권한 거부(NotAllowedError) 시 denied 상태가 된다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const { camera } = setupInScope()

    await camera.start()

    expect(camera.status.value).toBe('denied')
    expect(camera.stream.value).toBeNull()
  })

  it('카메라 미보유(NotFoundError) 시 unavailable 상태가 된다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('no camera', 'NotFoundError')))
    const { camera } = setupInScope()

    await camera.start()

    expect(camera.status.value).toBe('unavailable')
  })

  it('mediaDevices API가 없으면 unavailable 상태가 된다', async () => {
    const { camera } = setupInScope()

    await camera.start()

    expect(camera.status.value).toBe('unavailable')
  })

  it('그 외 실패(예: 카메라 점유 중)는 error 상태가 된다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('busy', 'NotReadableError')))
    const { camera } = setupInScope()

    await camera.start()

    expect(camera.status.value).toBe('error')
  })

  it('stop 시 모든 트랙을 정지하고 idle로 돌아간다', async () => {
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const { camera } = setupInScope()

    await camera.start()
    camera.stop()

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
    expect(camera.status.value).toBe('idle')
    expect(camera.stream.value).toBeNull()
  })

  it('스코프가 해제되면 스트림을 자동으로 정지한다', async () => {
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const { scope, camera } = setupInScope()

    await camera.start()
    scope.stop()

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })

  it('활성 상태에서 트랙이 외부 요인으로 끝나면(ended) error 상태가 되어 재시도를 유도한다', async () => {
    const { stream, tracks, fireVideoTrackEnded } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const { camera } = setupInScope()

    await camera.start()
    fireVideoTrackEnded()

    expect(camera.status.value).toBe('error')
    expect(camera.stream.value).toBeNull()
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })

  it('권한 응답 대기 중 스코프가 해제되면 늦게 도착한 스트림도 즉시 정지한다', async () => {
    const { stream, tracks } = createFakeStream()
    let resolveMedia!: (stream: MediaStream) => void
    stubGetUserMedia(() => new Promise((resolve) => (resolveMedia = resolve)))
    const { scope, camera } = setupInScope()

    const pending = camera.start()
    scope.stop()
    resolveMedia(stream)
    await pending

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
    expect(camera.stream.value).toBeNull()
  })
})
