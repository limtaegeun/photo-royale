import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useCameraStream } from '../composables/useCameraStream'
import { useCameraStreamStore } from '../stores/useCameraStreamStore'

function createFakeStream() {
  const tracks = [
    {
      readyState: 'live' as MediaStreamTrackState,
      stop: vi.fn<() => void>(),
      applyConstraints: vi.fn<(constraints: MediaTrackConstraints) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
    },
  ]
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream
  return { stream, tracks }
}

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  return getUserMedia
}

function setupInScope(roomCode = 'ABCD') {
  const scope = effectScope()
  const camera = scope.run(() => useCameraStream(roomCode))!
  return { scope, camera }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('useCameraStream', () => {
  it('start는 콕핏의 방 코드로 카메라를 쥐고 상태·스트림을 노출한다', async () => {
    const { stream } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const { camera } = setupInScope('ABCD')

    await camera.start()

    expect(camera.status.value).toBe('active')
    expect(camera.stream.value).toBe(stream)
    expect(useCameraStreamStore().roomCode).toBe('ABCD')
  })

  it('스코프가 해제돼도(콕핏 언마운트) 끄지 않고 저화질로 쥐어 둔다', async () => {
    const { stream, tracks } = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const { scope, camera } = setupInScope()
    await camera.start()

    scope.stop()

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith({
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 5 },
    })
  })

  it('같은 방의 콕핏을 다시 열면 권한을 다시 요청하지 않는다', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(stream))
    const first = setupInScope()
    await first.camera.start()
    first.scope.stop()

    const second = setupInScope()
    await second.camera.start()

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(second.camera.stream.value).toBe(stream)
    expect(second.camera.status.value).toBe('active')
  })
})
