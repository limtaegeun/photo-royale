import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'

vi.mock('@/shared/api/firebase', () => ({ auth: {} }))

const onAuthStateChangedMock = vi.fn<(auth: unknown, cb: (user: unknown) => void) => void>()
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth: unknown, cb: (user: unknown) => void) =>
    onAuthStateChangedMock(auth, cb),
}))

import { authGuard } from '../composables/useAuthGuard'

/** 마운트 직후 첫 콜백이 주어진 user로 오는 상황을 시뮬레이션한다 */
function emitAuthState(user: unknown) {
  onAuthStateChangedMock.mockImplementation((_auth, cb) => cb(user))
}

function routeWithMeta(
  meta: RouteLocationNormalized['meta'],
  query: RouteLocationNormalized['query'] = {},
  fullPath = '/',
) {
  return { meta, query, fullPath } as RouteLocationNormalized
}

describe('authGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    onAuthStateChangedMock.mockReset()
  })

  it('미인증 사용자가 requiresAuth 경로에 가면 목적지를 ?redirect=로 보존해 login으로 리다이렉트한다', async () => {
    emitAuthState(null)

    const result = await authGuard(routeWithMeta({ requiresAuth: true }, {}, '/waiting-room/AB2C'))

    expect(result).toEqual({ name: 'login', query: { redirect: '/waiting-room/AB2C' } })
  })

  it('인증 사용자는 requiresAuth 경로에 그대로 진입한다', async () => {
    emitAuthState({ uid: 'u1' })

    const result = await authGuard(routeWithMeta({ requiresAuth: true }))

    expect(result).toBeUndefined()
  })

  it('인증 사용자가 guestOnly(login/signup) 경로에 가면 entry로 차단한다', async () => {
    emitAuthState({ uid: 'u1' })

    const result = await authGuard(routeWithMeta({ guestOnly: true }))

    expect(result).toEqual({ name: 'entry', query: {} })
  })

  it('guestOnly 차단 시 공유 초대 코드(?code=) 쿼리를 entry로 보존한다', async () => {
    emitAuthState({ uid: 'u1' })

    const result = await authGuard(routeWithMeta({ guestOnly: true }, { code: 'AB2C' }))

    expect(result).toEqual({ name: 'entry', query: { code: 'AB2C' } })
  })

  it('guestOnly 차단 시 보존된 목적지(?redirect=)가 있으면 그리로 바로 보낸다', async () => {
    emitAuthState({ uid: 'u1' })

    const result = await authGuard(
      routeWithMeta({ guestOnly: true }, { redirect: '/waiting-room/AB2C' }),
    )

    expect(result).toBe('/waiting-room/AB2C')
  })

  it('guestOnly 차단 시 외부 URL ?redirect=는 무시하고 entry로 보낸다 (open redirect 방지)', async () => {
    emitAuthState({ uid: 'u1' })

    const result = await authGuard(
      routeWithMeta({ guestOnly: true }, { redirect: 'https://evil.com' }),
    )

    expect(result).toEqual({ name: 'entry', query: { redirect: 'https://evil.com' } })
  })

  it('미인증 사용자는 guestOnly(login/signup) 경로에 그대로 진입한다', async () => {
    emitAuthState(null)

    const result = await authGuard(routeWithMeta({ guestOnly: true }))

    expect(result).toBeUndefined()
  })

  it('meta 제약이 없는 경로는 인증 여부와 무관하게 통과시킨다', async () => {
    emitAuthState(null)

    const result = await authGuard(routeWithMeta({}))

    expect(result).toBeUndefined()
  })
})
