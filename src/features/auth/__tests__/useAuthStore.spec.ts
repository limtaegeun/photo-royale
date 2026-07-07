import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api/firebase', () => ({ auth: {} }))

const onAuthStateChangedMock = vi.fn<(auth: unknown, cb: (user: unknown) => void) => void>()
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth: unknown, cb: (user: unknown) => void) =>
    onAuthStateChangedMock(auth, cb),
}))

import { useAuthStore } from '../stores/useAuthStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    onAuthStateChangedMock.mockReset()
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
})
