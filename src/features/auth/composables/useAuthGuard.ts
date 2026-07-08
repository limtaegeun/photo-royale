import type { RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'

declare module 'vue-router' {
  interface RouteMeta {
    /** 인증된 사용자만 접근 가능. 미인증이면 signup으로 보낸다. */
    requiresAuth?: boolean
    /** 미인증 사용자 전용. 이미 인증됐으면 진입(entry)으로 막는다. */
    guestOnly?: boolean
  }
}

/**
 * 라우트 가드: 미인증 시 signup으로, 인증 시 signup(guestOnly) 접근을 차단한다.
 * 첫 인증 상태가 확정되기 전에는 판단할 수 없으므로 whenReady()로 기다린 뒤 결정한다.
 */
export async function authGuard(to: RouteLocationNormalized) {
  const authStore = useAuthStore()
  await authStore.whenReady()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'signup' }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'entry' }
  }
}
