import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api/firebase', () => ({ auth: {} }))

const onAuthStateChangedMock = vi.fn<(auth: unknown, cb: (user: unknown) => void) => void>()
const signOutMock = vi.fn<(auth: unknown) => Promise<void>>()
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth: unknown, cb: (user: unknown) => void) =>
    onAuthStateChangedMock(auth, cb),
  signOut: (auth: unknown) => signOutMock(auth),
}))

import { useAuthStore } from '../stores/useAuthStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    onAuthStateChangedMock.mockReset()
    signOutMock.mockReset()
  })

  it('초기 상태는 미인증이며 initialized=false', () => {
    const store = useAuthStore()
    expect(store.user).toBeNull()
    expect(store.initialized).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('init() 후 로그인 콜백이 오면 user와 상태를 반영한다', () => {
    let emit!: (user: unknown) => void
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      emit = cb
    })
    const store = useAuthStore()

    store.init()
    emit({ uid: 'u1' })

    expect(store.user).toEqual({ uid: 'u1' })
    expect(store.initialized).toBe(true)
    expect(store.isAuthenticated).toBe(true)
  })

  it('init()을 여러 번 호출해도 리스너는 한 번만 등록된다', () => {
    onAuthStateChangedMock.mockImplementation(() => {})
    const store = useAuthStore()

    store.init()
    store.init()

    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
  })

  it('logout()은 signOut 후 리스너 콜백을 기다리지 않고 user를 즉시 비운다', async () => {
    let emit!: (user: unknown) => void
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      emit = cb
    })
    signOutMock.mockResolvedValue(undefined)
    const store = useAuthStore()
    store.init()
    emit({ uid: 'u1' })

    await store.logout()

    expect(signOutMock).toHaveBeenCalledOnce()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('whenReady()는 첫 콜백이 오면 resolve된다', async () => {
    let emit!: (user: unknown) => void
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      emit = cb
    })
    const store = useAuthStore()

    const ready = store.whenReady()
    emit(null)

    await expect(ready).resolves.toBeUndefined()
    expect(store.initialized).toBe(true)
  })
})
