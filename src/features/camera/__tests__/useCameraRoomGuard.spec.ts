import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { NavigationFailure, RouteLocationNormalized } from 'vue-router'
import { releaseCameraOutsideRoom } from '../composables/useCameraRoomGuard'
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

function route(name: string, params: Record<string, string> = {}) {
  return { name, params } as unknown as RouteLocationNormalized
}

async function holdCamera(roomCode = 'ABCD') {
  const { stream, tracks } = createFakeStream()
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.resolve(stream) },
    configurable: true,
  })
  const store = useCameraStreamStore()
  await store.acquire(roomCode)
  store.park()
  return { store, tracks }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('releaseCameraOutsideRoom', () => {
  it('같은 방의 대기실·라운드 기록으로 가면 카메라를 그대로 쥐고 있는다', async () => {
    const { store, tracks } = await holdCamera('ABCD')

    releaseCameraOutsideRoom(route('waiting-room', { roomCode: 'ABCD' }))
    releaseCameraOutsideRoom(route('round-ops', { roomCode: 'abcd' }))

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
    expect(store.roomCode).toBe('ABCD')
  })

  it('다른 방으로 가면 카메라를 끈다', async () => {
    const { store, tracks } = await holdCamera('ABCD')

    releaseCameraOutsideRoom(route('waiting-room', { roomCode: 'WXYZ' }))

    expect(tracks[0]!.stop).toHaveBeenCalledOnce()
    expect(store.status).toBe('idle')
  })

  it.each(['entry', 'login', 'profile'])('방 밖(%s)으로 가면 카메라를 끈다', async (name) => {
    const { tracks } = await holdCamera('ABCD')

    releaseCameraOutsideRoom(route(name))

    expect(tracks[0]!.stop).toHaveBeenCalledOnce()
  })

  it('막히거나 취소된 이동이면 그대로 둔다', async () => {
    const { tracks } = await holdCamera('ABCD')

    releaseCameraOutsideRoom(route('entry'), route('camera'), {} as NavigationFailure)

    expect(tracks[0]!.stop).not.toHaveBeenCalled()
  })

  it('쥐고 있는 카메라가 없으면 아무것도 하지 않는다', () => {
    const store = useCameraStreamStore()
    const release = vi.spyOn(store, 'release')

    releaseCameraOutsideRoom(route('entry'))

    expect(release).not.toHaveBeenCalled()
  })
})
